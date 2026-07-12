# BossAI Radar Lite Commercial Lead Data Notice

BossAI Radar Lite v0.4.0 can store commercial-license applications and Pro waitlist submissions in the local SQLite database used by the current deployment.

## Data stored

When an applicant actively confirms the license statement and submits the form, the system may store:

- application type;
- name, company or team;
- contact details entered by the applicant;
- team size, budget, target timeline and deployment preference;
- use case and requested capabilities;
- interface language;
- submission and consent timestamps;
- administrator-added status, owner, quote, follow-up time and activity history.

## Data not stored

Lite does not write the following data to the lead database by default:

- raw visitor IP addresses;
- browser cookies;
- device fingerprints;
- passwords;
- email-account credentials;
- payment-card information.

An IP address is used only in process memory for short-term submission rate limiting and disappears when the service restarts.

## Data location

Lead data and radar evidence use the same local file:

```text
data/radar-lite.sqlite
```

This file is excluded by `.gitignore` and must not be uploaded to GitHub, public storage or release archives.

## Access control

- The public API can submit applications but cannot read leads.
- Reading, exporting, updating, following up or deleting leads requires `RADAR_ADMIN_API_KEY`.
- When listening only on `127.0.0.1`, the local administrator page can be accessed directly.
- Public deployments must use HTTPS and a strong random administrator key.
- Never place the administrator key in frontend source, screenshots, logs or repositories.

## Deduplication and rate limiting

- A repeated submission with the same contact and application type within 24 hours returns the existing lead reference instead of creating another record.
- The default submission limit is five attempts per network source per hour.
- A hidden honeypot field blocks basic automated form spam.

## Operator responsibilities

The deployment operator controls the lead data and should, according to applicable law and business policy:

- explain the purpose of data collection;
- collect only information required for license evaluation;
- restrict administrator access;
- back up and clean data on an appropriate schedule;
- export, correct or delete data upon a reasonable request;
- avoid undisclosed marketing use or resale of contact data.

Administrators can permanently delete an individual lead in the workspace. Its full activity history is deleted at the same time.

## Disable lead capture

```env
COMMERCIAL_LEAD_CAPTURE_ENABLED=false
COMMERCIAL_LEAD_ADMIN_ENABLED=false
```

When database capture is disabled, the commercial application page still supports copy and email-backup modes.
