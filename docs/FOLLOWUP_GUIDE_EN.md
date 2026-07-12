# BossAI Radar Lite Daily Lead Follow-Up Guide

BossAI Radar Lite v0.5 is not an automatic bulk-messaging system. Its purpose is to make five questions immediately clear every day:

1. Who must be contacted today?
2. Why does the contact need attention now?
3. What should be sent?
4. Which stage should the opportunity move to next?
5. When should the next follow-up happen?

## Four Follow-Up Queues

| Queue | Meaning | Priority |
|---|---|---:|
| OVERDUE | The planned follow-up date has passed | Highest |
| TODAY | Due today | High |
| UNSCHEDULED | Active lead without a next follow-up date | Medium-high |
| UPCOMING | Due within the selected future window | Medium |

`WON` and `LOST` leads are excluded from the active queue.

## Urgency Ranking

The 0–100 urgency score combines:

- overdue or due-today status;
- HOT / WARM / COOL priority;
- current sales stage;
- immediate or 30-day launch timing;
- whether a quote already exists.

The urgency score only sorts the queue. It never changes lead data or sends a message automatically.

## Recommended Stage Progression

| Current Stage | Recommended Next Stage |
|---|---|
| NEW | QUALIFIED |
| QUALIFIED | CONTACTED |
| CONTACTED | PROPOSAL |
| PROPOSAL | NEGOTIATION |
| NEGOTIATION | WON |
| WAITLIST | WAITLIST |

When **Apply Recommended Next Step** is clicked, the system:

- updates the lead to the recommended stage;
- schedules the next follow-up based on HOT / WARM / COOL;
- records that the recommendation was applied.

It never contacts the customer automatically.

## Customer Language vs Workspace Language

- administrative reasons, ranking and recommended actions follow the current workspace language;
- the actual customer-facing email or message follows the language stored on the lead;
- when an email address is recognized, the local email client can be opened;
- without an email address, the draft can still be copied for WeChat, SMS or another channel.

## Daily Operating Order

1. Handle HOT leads in OVERDUE;
2. handle the remaining OVERDUE queue;
3. handle TODAY;
4. schedule every active UNSCHEDULED lead;
5. review the next seven days of UPCOMING items;
6. after each contact, record the outcome, update the stage and schedule the next follow-up.

## Exports

Administrators can export:

- a Chinese or English Markdown follow-up brief;
- a 30-day `.ics` calendar file.

Overdue items are assigned to the nearest executable time when imported, so the calendar does not contain unusable past events.

## Security Boundary

Every follow-up queue, draft, report and calendar endpoint is administrator-only and requires `RADAR_ADMIN_API_KEY`. Lite does not include automated email campaigns, automated WeChat outreach, third-party CRM synchronization or multi-user sales permissions. Those capabilities belong to the commercial Pro scope.
