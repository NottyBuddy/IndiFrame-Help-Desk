-- Additive migration: require newly created agents to change their temporary password on first login.
-- Existing accounts retain their current password state.
ALTER TABLE agents ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0 CHECK (must_change_password IN (0, 1));
