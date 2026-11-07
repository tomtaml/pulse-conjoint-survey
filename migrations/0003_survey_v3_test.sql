-- Additive v3 questionnaire test storage in the existing conjoint D1 database.
CREATE TABLE IF NOT EXISTS survey_v3_test_submissions (
  id TEXT PRIMARY KEY,
  received_at TEXT NOT NULL,
  instrument_version TEXT NOT NULL,
  schema_version TEXT NOT NULL,
  record_kind TEXT NOT NULL CHECK (record_kind = 'instrument_test'),
  site TEXT NOT NULL CHECK (site IN ('tampere','trikala','oxfordshire')),
  language TEXT NOT NULL,
  technology TEXT NOT NULL CHECK (technology IN ('wpt','v2g')),
  respondent_route TEXT NOT NULL CHECK (respondent_route IN ('private','public')),
  active_ms INTEGER NOT NULL CHECK (active_ms >= 0),
  payload_sha256 TEXT NOT NULL,
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json))
);
CREATE INDEX IF NOT EXISTS idx_survey_v3_test_version_time ON survey_v3_test_submissions (instrument_version, received_at);
CREATE INDEX IF NOT EXISTS idx_survey_v3_test_received ON survey_v3_test_submissions (received_at);
