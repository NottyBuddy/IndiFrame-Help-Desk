-- Retire the Projects feature from the active Help Desk schema.
-- IMPORTANT: Take and verify a D1 backup before applying this migration.
-- Existing project data is copied into non-functional archive tables before active tables are removed.
-- Apply only to databases where the three legacy Projects tables exist.

CREATE TABLE IF NOT EXISTS retired_projects_archive AS
SELECT * FROM projects;

CREATE TABLE IF NOT EXISTS retired_project_products_archive AS
SELECT * FROM project_products;

CREATE TABLE IF NOT EXISTS retired_project_activity_archive AS
SELECT * FROM project_activity;

DROP TABLE IF EXISTS project_products;
DROP TABLE IF EXISTS project_activity;
DROP TABLE IF EXISTS projects;

-- Project-specific indexes are automatically removed when their source tables are dropped.

-- Remove retired Projects wording from seeded quiz content without deleting attempts.
UPDATE quiz_questions
SET question = replace(question, 'lead or project', 'customer record'),
    question = replace(question, 'project handover', 'customer handover'),
    options_json = replace(options_json, 'Delete the project', 'Ignore the issue')
WHERE lower(question) LIKE '%project%'
   OR lower(options_json) LIKE '%project%';
