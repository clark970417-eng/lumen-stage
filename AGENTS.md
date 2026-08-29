# Project completion rule

- After completing and verifying any user-requested product or website change, commit only the files that belong to that completed request and push the commit to the current GitHub branch.
- Include the GitHub branch and commit identifier in the final response.
- Do not include unrelated, pre-existing, or unfinished working-tree changes in the commit or push.
- After completing and verifying any user-requested product or website change, deploy the project to Vercel production with `vercel deploy --prod --yes`.
- Treat a successful production deployment as part of the definition of done, and include the production URL in the final response.
- If deployment is blocked by authentication, permissions, network access, or a failed build, report the blocker clearly and do not claim the work is fully complete.
- Do not deploy unrelated, pre-existing, or unfinished working-tree changes without first confirming their scope with the user.
