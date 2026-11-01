# Isolated Neon Functions deployment test

Project: renta-car (noisy-heart-11148374)
Branch: test-functions (br-misty-lake-bachd4fm)
Function: rentatest
Runtime: Node.js 24

Public URL: https://br-misty-lake-bachd4fm-rentatest.compute.c-8.eu-central-1.aws.neon.tech/

index.mjs is the exact code deployed as the root of a ZIP archive.
This function has no secrets, does not query the database and does not connect Telegram.
The branch was created without a database compute endpoint.

Run read-only HTTP verification with: python deployment-test/check.py
The Neon deployment smoke test workflow runs this probe on changes here or by manual dispatch.
It verifies the live deployment; it does not deploy the source automatically.

The rental frontend and production backend have not been migrated by this test.
