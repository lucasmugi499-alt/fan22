# Data Visibility And Write Authority

| Record | Public read | Owner read | Operational read | Client write | Trusted server write |
|---|---:|---:|---:|---:|---:|
| Sports, leagues, seasons, teams, athletes | Yes | Yes | Yes | Profile allowlists only | Yes |
| Matches | Yes | Yes | Yes | Fixture allowlist for League Admin | Official result only |
| Result submissions | No | Involved teams | Owning league/platform | Claims and governed responses | Finalization |
| Result events | Status/role/timestamp only | Involved teams | Owning league/platform | Append-only matching transition | Yes |
| Support needs | Yes | Creator | Team/league/platform | Proposal and verified recipient updates | Approval and raised amount |
| Support completion evidence | Yes after publication | Recipient | Team/league/platform | Recipient update proposal only | Completion state |
| Challenges | Yes | Athlete | Team/league/platform | Proposal only | Lifecycle, approvals, outcome |
| Contributions/payment intents | No | Supporter | Platform | No | Yes |
| Allocations/payouts/refunds/chargebacks | No | No | Platform | No | Yes |
| Ledger/webhook/settlement records | No | No | Platform | No | Yes |
| Points events | No | User | Platform | No | Yes |
| Match attendance | No | Checked-in user | League/platform | Signed venue check-in only | Validation and points |
| Feed posts | Yes when published | Author | League/platform | Authored content allowlist | Moderation and counters |
| Comments | Yes when published | Author | League/platform | Authored content allowlist | Moderation and counters |
| Notifications | No | User | Platform | Read flag only | Creation |
| Reports and compliance cases | No | Reporter where applicable | Platform | Report creation | Decisions |

Official athlete statistics, verification state, authority assignments, money, points,
ledger entries, and settlement state are never client-owned fields.

Sensitive evidence uses controlled Storage paths and trusted signed upload sessions.
Browser clients cannot directly create entity public media, published media or match
evidence objects. Public result provenance responses are rate-limited, cached, bounded,
and withhold private actor identifiers, internal notes, and internal-only workflow events.
