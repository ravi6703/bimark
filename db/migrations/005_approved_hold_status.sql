-- §9/§20 — "Approve & hold" mode: content is locked in but not auto-published;
-- a manual publish action (WF-5b) triggers the real post later, on demand.
ALTER TYPE draft_status ADD VALUE IF NOT EXISTS 'approved_hold';
