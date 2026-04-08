## 2024-05-22 - Audit Log Spoofing and SSRF Risk
**Vulnerability:**
1. Audit log sync endpoint blindly trusts client-provided `actor_user_id`.
2. Network printing utility allows arbitrary host/port input from users.
**Learning:**
1. Offline sync patterns often lead to over-trusting client metadata to preserve history, creating spoofing risks.
2. Direct socket utilities in internal services are high-risk for SSRF if not strictly gated.
**Prevention:**
1. Always validate and prioritize server-side session user IDs over client-provided metadata for security-critical logs.
2. Implement strict host whitelisting and port validation for any internal network-level operations.
