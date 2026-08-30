#!/usr/bin/env bash
#
# Create the spend guards: a billing budget with alert thresholds, and a Firestore read
# anomaly alert.
#
# ## Why this is a script and not something the app does
#
# Both live in GCP, not in Firestore, and creating them needs roles the application's service
# account does not have and should not have: Billing Account Administrator for the budget, and
# Monitoring Editor for the alert policy. So this runs as a person, deliberately.
#
# ## Why it exists at all
#
# Eleven Cloud Functions ran on the platform default concurrency ceiling with no spend guard.
# They now declare `maxInstances`, which bounds the fan-out, but a cap on concurrency is not a
# cap on cost — a backfill, a retry storm or a bulk athlete import still converts directly into
# spend, and the first athlete import of a real league is the likely trigger.
#
# The alert is the half that tells a human. Set it before real traffic, not after a bill.
#
# ## Usage
#
#   scripts/ops/spend-guard.sh                      # show what would be created
#   scripts/ops/spend-guard.sh --apply              # create it
#   scripts/ops/spend-guard.sh --apply --amount=200 # a different monthly ceiling
#
# Defaults to the demo project. Pass --project for another.

set -euo pipefail

PROJECT="manifest-quasar-479416-s7"
AMOUNT="100"
APPLY="false"

for arg in "$@"; do
  case "$arg" in
    --apply) APPLY="true" ;;
    --project=*) PROJECT="${arg#*=}" ;;
    --amount=*) AMOUNT="${arg#*=}" ;;
    *) echo "Unknown argument: $arg" >&2; exit 2 ;;
  esac
done

if ! command -v gcloud >/dev/null 2>&1; then
  echo "gcloud is not installed. https://cloud.google.com/sdk/docs/install" >&2
  exit 1
fi

# Checked before anything else, because every command below fails obscurely without it and
# "You do not currently have an active account selected" is not an obvious diagnosis when it
# appears three commands into a script.
if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" 2>/dev/null | grep -q .; then
  cat >&2 <<'EOF'
No active gcloud account.

  gcloud auth login
  gcloud config set project manifest-quasar-479416-s7

You also need Billing Account Administrator to create a budget, and Monitoring Editor to
create an alert policy. Neither is granted to the application's service account, and neither
should be.
EOF
  exit 1
fi

BILLING_ACCOUNT="$(gcloud billing projects describe "$PROJECT" \
  --format="value(billingAccountName)" 2>/dev/null | sed 's|billingAccounts/||')"

if [ -z "$BILLING_ACCOUNT" ]; then
  echo "Could not resolve a billing account for $PROJECT. Is billing enabled on it?" >&2
  exit 1
fi

echo "Project        : $PROJECT"
echo "Billing account: $BILLING_ACCOUNT"
echo "Monthly budget : \$$AMOUNT"
echo "Thresholds     : 50%, 90%, 100% of budget, and 100% of FORECAST"
echo ""

if [ "$APPLY" != "true" ]; then
  echo "Nothing was created. Re-run with --apply."
  exit 0
fi

# The forecast threshold is the one that matters. A 100%-of-actual alert tells you the money is
# already gone; a 100%-of-forecast alert fires while the month is still young enough to act on.
gcloud billing budgets create \
  --billing-account="$BILLING_ACCOUNT" \
  --display-name="GoalPlace256 ${PROJECT} monthly" \
  --budget-amount="${AMOUNT}USD" \
  --filter-projects="projects/${PROJECT}" \
  --threshold-rule=percent=0.5 \
  --threshold-rule=percent=0.9 \
  --threshold-rule=percent=1.0 \
  --threshold-rule=percent=1.0,basis=forecasted-spend

echo ""
echo "Budget created."
echo ""

# Firestore read volume, as a rate rather than a total. A total is only exceeded once and then
# stays exceeded; a rate catches the shape that actually costs money — a sudden sustained
# burst from a backfill or a retry loop — and recovers on its own afterwards.
POLICY_FILE="$(mktemp)"
cat > "$POLICY_FILE" <<'EOF'
{
  "displayName": "GoalPlace256 Firestore read spike",
  "documentation": {
    "content": "Firestore document reads have been running above 500/s for 5 minutes. Usual causes: a backfill or migration script, a retried Cloud Function, or an unbounded collection read that reached a real catalogue. Check Cloud Functions logs and any script running against this project.",
    "mimeType": "text/markdown"
  },
  "conditions": [
    {
      "displayName": "Reads above 500/s for 5 minutes",
      "conditionThreshold": {
        "filter": "resource.type = \"firestore.googleapis.com/Database\" AND metric.type = \"firestore.googleapis.com/document/read_count\"",
        "aggregations": [
          {
            "alignmentPeriod": "300s",
            "perSeriesAligner": "ALIGN_RATE",
            "crossSeriesReducer": "REDUCE_SUM"
          }
        ],
        "comparison": "COMPARISON_GT",
        "thresholdValue": 500,
        "duration": "300s"
      }
    }
  ],
  "combiner": "OR",
  "enabled": true
}
EOF

gcloud alpha monitoring policies create --project="$PROJECT" --policy-from-file="$POLICY_FILE"
rm -f "$POLICY_FILE"

cat <<'EOF'

Alert policy created.

Two things this script deliberately does NOT do:

  1. Attach a notification channel. Where an alert should go is a decision about who is on
     call, not something a script should guess. Create one and attach it:

       gcloud alpha monitoring channels create --display-name="GoalPlace ops" \
         --type=email --channel-labels=email_address=you@example.com

  2. Test it. An untested alert is an assumption. Trigger the read policy with a deliberate
     burst — `npm run standings:rebuild:apply` against a large database will do it — and
     confirm the notification actually arrives. An alert nobody has seen fire is not a
     guarantee that it will.
EOF
