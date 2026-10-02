-- Up Migration

-- People who sign in. Role decides which side of the platform they use.
CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  display_name text NOT NULL,
  role text NOT NULL CHECK (role IN ('worker', 'employer')),
  -- Workers choose whether employers can see their ledger (Ticket 8).
  profile_visible boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  -- Target for employers' (user_id, user_role) foreign key.
  UNIQUE (id, role)
);
CREATE UNIQUE INDEX users_email_key ON users (lower(email));

-- Company details for a user with the employer role.
CREATE TABLE employers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  -- Always 'employer'. With the foreign key below, the database refuses an
  -- employer row for a worker, and refuses changing such a user's role.
  user_role text NOT NULL DEFAULT 'employer' CHECK (user_role = 'employer'),
  company_name text NOT NULL,
  website text,
  -- Set when worker reports say a job is not truly remote.
  flagged_for_review boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (user_id, user_role) REFERENCES users (id, role) ON DELETE CASCADE
);

-- Skill areas workers can prove, e.g. "Using AI at work".
CREATE TABLE topics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  -- Per-topic attempt limit (core rule 6).
  max_attempts integer NOT NULL DEFAULT 3 CHECK (max_attempts > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Platform-written tasks. Variants are generated from these per attempt.
CREATE TABLE task_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id uuid NOT NULL REFERENCES topics (id) ON DELETE RESTRICT,
  title text NOT NULL,
  instructions text NOT NULL,
  time_limit_minutes integer NOT NULL CHECK (time_limit_minutes BETWEEN 30 AND 60),
  rubric jsonb NOT NULL,
  variable_parts jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- AI use is allowed and scored on AI-skill tasks (core rule 4).
  allows_ai boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX task_templates_topic_id_idx ON task_templates (topic_id);

-- One worker's attempt at one generated variant. Stores the exact variant
-- given, so any score can be audited against what the worker actually saw.
CREATE TABLE task_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  task_template_id uuid NOT NULL REFERENCES task_templates (id) ON DELETE RESTRICT,
  -- Copied from the template so per-topic attempt limits are a simple count.
  topic_id uuid NOT NULL REFERENCES topics (id) ON DELETE RESTRICT,
  variant_content jsonb NOT NULL,
  -- Hash of variant_content. Unique, so no two attempts share a task (core rule 2).
  variant_hash text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'in_progress'
    CHECK (status IN ('in_progress', 'submitted', 'scored', 'expired')),
  started_at timestamptz NOT NULL DEFAULT now(),
  deadline_at timestamptz NOT NULL,
  submitted_at timestamptz,
  answer text,
  -- The worker's defence of their choices (core rule 3).
  explanation text,
  -- Follow-up questions asked and the worker's replies.
  follow_ups jsonb NOT NULL DEFAULT '[]'::jsonb,
  score numeric(5, 2) CHECK (score BETWEEN 0 AND 100),
  -- Per-criterion scores with a short reason each.
  score_breakdown jsonb,
  scored_at timestamptz,
  CHECK (deadline_at > started_at),
  CHECK (status <> 'scored' OR (score IS NOT NULL AND scored_at IS NOT NULL)),
  -- Target for ledger_entries' composite foreign key.
  UNIQUE (id, user_id, topic_id)
);
CREATE INDEX task_attempts_user_topic_idx ON task_attempts (user_id, topic_id);
CREATE INDEX task_attempts_template_idx ON task_attempts (task_template_id);

-- Public results. Append-only history: one row per scored attempt.
-- Rows can never be changed or removed, so a user or attempt with ledger
-- history cannot be deleted either (RESTRICT below, plus the trigger).
CREATE TABLE ledger_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  topic_id uuid NOT NULL REFERENCES topics (id) ON DELETE RESTRICT,
  task_attempt_id uuid NOT NULL UNIQUE,
  score numeric(5, 2) NOT NULL CHECK (score BETWEEN 0 AND 100),
  -- Set at insert time. It cannot be flipped later.
  verified boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  -- user_id and topic_id must match the attempt the entry came from.
  FOREIGN KEY (task_attempt_id, user_id, topic_id)
    REFERENCES task_attempts (id, user_id, topic_id) ON DELETE RESTRICT
);
CREATE INDEX ledger_entries_user_topic_idx ON ledger_entries (user_id, topic_id);
CREATE INDEX ledger_entries_topic_score_idx ON ledger_entries (topic_id, score DESC);

CREATE FUNCTION ledger_entries_block_changes() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'ledger_entries is append-only: % is not allowed', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ledger_entries_append_only
  BEFORE UPDATE OR DELETE ON ledger_entries
  FOR EACH ROW EXECUTE FUNCTION ledger_entries_block_changes();

-- Best verified result per worker per topic (core rule 6). Ties go to the earliest.
CREATE VIEW ledger_best AS
SELECT DISTINCT ON (user_id, topic_id)
  id AS ledger_entry_id, user_id, topic_id, task_attempt_id, score, created_at
FROM ledger_entries
WHERE verified
ORDER BY user_id, topic_id, score DESC, created_at ASC;

-- Job postings. Only truly remote jobs are allowed (core rule 5).
CREATE TABLE jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employer_id uuid NOT NULL REFERENCES employers (id) ON DELETE CASCADE,
  title text NOT NULL,
  description text NOT NULL,
  -- 'anywhere' = no location restriction; 'timezone_overlap' = overlap only.
  remote_type text NOT NULL CHECK (remote_type IN ('anywhere', 'timezone_overlap')),
  -- Required for timezone_overlap, e.g. "4 hours overlap with UTC 09:00-17:00".
  timezone_overlap text,
  -- The employer's signed statement that the job is truly remote.
  remote_declaration text NOT NULL CHECK (length(trim(remote_declaration)) > 0),
  remote_declared_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'under_review', 'closed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT jobs_remote_terms_check CHECK (
    (remote_type = 'anywhere' AND timezone_overlap IS NULL)
    OR (remote_type = 'timezone_overlap' AND length(trim(coalesce(timezone_overlap, ''))) > 0)
  )
);
CREATE INDEX jobs_employer_id_idx ON jobs (employer_id);

-- Worker reports that a job is not truly remote.
CREATE TABLE job_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES jobs (id) ON DELETE CASCADE,
  reporter_user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  reason text NOT NULL CHECK (length(trim(reason)) > 0),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'upheld', 'dismissed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (job_id, reporter_user_id)
);

-- Down Migration

DROP TABLE job_reports;
DROP TABLE jobs;
DROP VIEW ledger_best;
DROP TABLE ledger_entries;
DROP FUNCTION ledger_entries_block_changes();
DROP TABLE task_attempts;
DROP TABLE task_templates;
DROP TABLE topics;
DROP TABLE employers;
DROP TABLE users;
