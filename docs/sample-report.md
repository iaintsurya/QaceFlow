# Investigation report: INC-0001

> **Imported data.** Events were supplied by an analyst and have not been verified by QaceFlow. Correlated activity is a candidate for investigation, not proof of compromise.

## Case metadata

| Field | Value |
| --- | --- |
| Incident | INC-0001 |
| Title | Suspicious account activity |
| Status | investigating |
| Severity | high |
| Host | srv-finance-02 |
| Account | j.doe |
| Alerts | 2 |
| Evidence events | 7 |
| Report generated (UTC) | 2026-10-14T15:00:00Z |

## Why these alerts were grouped

2 alerts (AUTH-001, AUTH-002) share host srv-finance-02 and account j.doe. This is a candidate relationship, not proof that the events have the same cause.

## Alerts and detection rules

### ALT-AUTH-001-01 · AUTH-001 · MEDIUM

**Repeated authentication failures.** 6 failed logins for j.doe on srv-finance-02 within 120 seconds.

- Rule threshold: 5 or more failed logins for the same host and account within 120 seconds
- Why it matters: Repeated failures in a short period can indicate password guessing, but can also come from a misconfigured service or a user mistyping a password.
- Evidence references: SAMPLE-001, SAMPLE-002, SAMPLE-003, SAMPLE-004, SAMPLE-005, SAMPLE-006

### ALT-AUTH-002-01 · AUTH-002 · HIGH

**Failed logins followed by success.** 6 failed login(s) preceded a successful login for j.doe on srv-finance-02 within five minutes.

- Rule threshold: A successful login preceded by at least 1 failed login for the same host and account within 5 minutes
- Why it matters: A success shortly after failures can mean a guessed or reused credential was accepted, or simply that the user corrected a typo. Verify with the account owner.
- Evidence references: SAMPLE-001, SAMPLE-002, SAMPLE-003, SAMPLE-004, SAMPLE-005, SAMPLE-006, SAMPLE-007

## Evidence timeline (UTC)

| Time | Event ID | Type | Account | Host | Source IP |
| --- | --- | --- | --- | --- | --- |
| 2026-10-14T14:05:00+00:00 | SAMPLE-001 | authentication.failure | j.doe | srv-finance-02 | 198.51.100.23 |
| 2026-10-14T14:05:10+00:00 | SAMPLE-002 | authentication.failure | j.doe | srv-finance-02 | 198.51.100.23 |
| 2026-10-14T14:05:20+00:00 | SAMPLE-003 | authentication.failure | j.doe | srv-finance-02 | 198.51.100.23 |
| 2026-10-14T14:05:30+00:00 | SAMPLE-004 | authentication.failure | j.doe | srv-finance-02 | 198.51.100.23 |
| 2026-10-14T14:05:40+00:00 | SAMPLE-005 | authentication.failure | j.doe | srv-finance-02 | 198.51.100.23 |
| 2026-10-14T14:05:50+00:00 | SAMPLE-006 | authentication.failure | j.doe | srv-finance-02 | 198.51.100.23 |
| 2026-10-14T14:07:05+00:00 | SAMPLE-007 | authentication.success | j.doe | srv-finance-02 | 198.51.100.23 |

## Analyst findings

> Example finding (illustrative): six failures in 50 seconds, then a success from the same source IP. Confirm with the account owner before closing.

_Notes last saved (UTC): 2026-10-14T14:55:00Z_

## Known limitations

- Detection rules are simple, threshold-based and can raise false positives.
- A success after failures may be a user correcting a typo; verify with the account owner.
- This report reflects only the events stored in QaceFlow at generation time.
