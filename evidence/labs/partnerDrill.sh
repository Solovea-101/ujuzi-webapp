#!/usr/bin/env bash
# One look at Ujuzi's job matches, as a graduate would load the course page. Used in the Week 11 real-partner drill.
#   UJUZI=http://localhost:4013 evidence/labs/partnerDrill.sh <course> <label>
# Prints the time (UTC), what came back and how long it took. Never prints a token.
set -euo pipefail
UJUZI=${UJUZI:-http://localhost:4013}
COURSE=${1:-crs_501}
LABEL=${2:-look}
TOKEN=$(curl -s -X POST "$UJUZI/api/auth/login" -H 'Content-Type: application/json' \
  -d '{"email":"achieng.otieno@example.com","password":"'"${SEED_PASSWORD:-ujuzi-demo-pass}"'"}' | python3 -I -c "import json,sys; print(json.load(sys.stdin)['token'])")
OUT=$(mktemp)
HEAD=$(curl -s -D - -o "$OUT" -m 60 -w "%{time_total}" -H "Authorization: Bearer $TOKEN" "$UJUZI/api/courses/$COURSE/job-matches")
CODE=$(printf '%s' "$HEAD" | head -1 | awk '{print $2}')
STALE=$(printf '%s' "$HEAD" | grep -i '^x-data-stale' | tr -d '\r' || true)
ASOF=$(printf '%s' "$HEAD" | grep -i '^x-data-as-of' | tr -d '\r' || true)
SECS=$(printf '%s' "$HEAD" | tail -1)
BODY=$(python3 -I -c "
import json,sys
b=json.load(open('$OUT'))
print(str(len(b))+' jobs' if isinstance(b,list) else 'message=\"'+b.get('message','')+'\"')")
echo "$(date -u +%H:%M:%SZ) [$LABEL] $COURSE: HTTP $CODE, $BODY ${STALE:+| $STALE }${ASOF:+| $ASOF }(${SECS} s)"
rm -f "$OUT"
