# Permission contract

| Action | Employee | Manager | HR | Appointed Head of HR |
|---|---|---|---|---|
| Read own work / submit updates | Own only | Own employee context | Work oversight | Work oversight |
| Assign or delegate work | No | Active direct reports; delegation only own assigned work | Only with manager role | Only with manager role |
| Change hierarchy / setup | No | No | Own tenant | Own tenant |
| Draft employee reflection | Own only | Own employee context | Own employee context | Own employee context |
| Draft manager appraisal | No | Assigned reviewer only | Only if assigned manager | Only if assigned manager |
| Monitor cycle state | Own | Assigned reviews | Tenant | Tenant |
| Read private drafts | Author only | Author only | Author only | Author only |
| Validate evidence | No | No | No | Explicit appointment; source selected in a current submitted form; no self-validation |
| Request AI / review AI output | No | No | No | Explicit review appointment, both forms submitted, evidence validated/excluded |
| Record final human assessment / conversation | No | No | No | Explicit independent appointment |
| Acknowledge shared record | Employee participant | Manager participant | No bypass | No bypass |
| Finalise record | No | No | No | Both acknowledgements required |
| Update development | Employee/owner | Assigned manager/owner | No arbitrary update | No arbitrary update |
| Read final narrative | Participant | Participant | Status only unless participant | Appointed reviewer |

Dual-role users switch responsibilities without receiving another identity. All backend checks use membership and object relationships. UI visibility is convenience, not a security control.

Requests for a foreign tenant object return 404. Invalid related IDs return validation errors. Role actions return 403. Stale versions return 409. Submitted/final records reject mutation regardless of UI state.

Production permission tests must cover tenant isolation, changed/inactive memberships, hierarchy changes, self-review, manager reassignment, source download, prompt injection and final-record tampering. Never infer Head of HR from a designation string.
