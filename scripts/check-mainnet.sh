#!/usr/bin/env bash
# Read-only health check for the Conciliado contract and payer on Arc mainnet.
# Sends no transaction and needs no key. Needs curl, jq, bc, and cast (or arc-cast).
# Exit code 1 if any line is PAGE. WARN and INFO do not change the exit code.
# The expected values are the state recorded in docs/deployments/mainnet.md; override
# them with environment variables when the record changes.
set -u

RPC="${RPC_URL:-https://rpc.mainnet.arc.io}"
CONTRACT=0xC86e2241166785344E4d6692E4D2A3D4c8466d0e
PAYER=0x429Fd794Ed2166c0F6fFef39fA6A1F580Ba64364
DEPLOY_BLOCK=26689148
EXPECTED_NONCE="${EXPECTED_NONCE:-4}"
EXPECTED_ALLOWED="${EXPECTED_ALLOWED:-6}"   # PayeeAdded minus PayeeRemoved for the payer
EXPECTED_CODEHASH=0x6aa81ec65c8a13dc19048ac2d34ca9b8270a7de2a1a13cb0f6ec04adbb4d7932
WARN_BALANCE_WEI="${WARN_BALANCE_WEI:-1000000000000000000}"   # 1 USDC
PAGE_BALANCE_WEI="${PAGE_BALANCE_WEI:-250000000000000000}"    # 0.25 USDC
MAX_HEAD_AGE_S="${MAX_HEAD_AGE_S:-30}"

# keccak256 of the three event signatures (cast sig-event "BatchPaid(uint256,address,uint256,uint256)")
ADDED=0xdc5ead19b6024fc846be8ef64aa124f9d38b64826b5d39d63010d18b34942cdb     # PayeeAdded
REMOVED=0x45b8bd2a50254d8668cba83d731f47650a5372807cedc4f4dccf0fdf7fc8dd6d   # PayeeRemoved
BATCH=0x57fc392f5c64b45d764276082cc4f05bd8711464a10a8b3ee6d0ab92fccb0a39     # BatchPaid
LINE=0xdeb7ab14506804b2d5cb07e7e77a7f93f7f6defd4de1637c3ccb39f471341dd3       # InvoicePaid

failed=0
say() { printf '%-5s %s\n' "$1" "$2"; [ "$1" = PAGE ] && failed=1; return 0; }
rpc() { # method, params as JSON; prints the raw JSON-RPC response
  curl -s -m 15 -H 'content-type: application/json' \
    --data "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"$1\",\"params\":$2}" "$RPC"
}

chain_hex=$(rpc eth_chainId '[]' | jq -r '.result // empty')
if [ -z "$chain_hex" ]; then
  say PAGE "RPC $RPC did not answer eth_chainId"
  exit 1
fi
[ $((chain_hex)) = 5042 ] && say OK "chain id 5042" || say PAGE "chain id is $((chain_hex)), expected 5042"

blk=$(rpc eth_getBlockByNumber '["latest",false]')
head=$(( $(echo "$blk" | jq -r '.result.number') ))
age=$(( $(date -u +%s) - $(echo "$blk" | jq -r '.result.timestamp') ))
if [ "$age" -le "$MAX_HEAD_AGE_S" ]; then
  say OK "head block $head, ${age}s old"
else
  say PAGE "head block $head is ${age}s old (limit ${MAX_HEAD_AGE_S}s)"
fi

bal=$(cast balance "$PAYER" --rpc-url "$RPC")
if [ "$(echo "$bal < $PAGE_BALANCE_WEI" | bc)" = 1 ]; then
  say PAGE "payer balance $bal wei, below $PAGE_BALANCE_WEI"
elif [ "$(echo "$bal < $WARN_BALANCE_WEI" | bc)" = 1 ]; then
  say WARN "payer balance $bal wei, below $WARN_BALANCE_WEI"
else
  say OK "payer balance $bal wei"
fi

nonce=$(cast nonce "$PAYER" --rpc-url "$RPC")
if [ "$nonce" = "$EXPECTED_NONCE" ]; then
  say OK "payer nonce $nonce"
else
  say PAGE "payer nonce is $nonce, record says $EXPECTED_NONCE: a transaction that is not in the record"
fi

cbal=$(cast balance "$CONTRACT" --rpc-url "$RPC")
[ "$cbal" = 0 ] && say OK "contract holds 0 wei" || say WARN "contract holds $cbal wei (nothing in the contract can move it)"

hash=$(cast keccak "$(cast code "$CONTRACT" --rpc-url "$RPC")")
[ "$hash" = "$EXPECTED_CODEHASH" ] && say OK "runtime code hash unchanged" || say PAGE "runtime code hash is $hash"

# eth_getLogs allows at most 10000 blocks per call, so page in 9999-block steps and
# pause between pages: the public endpoint answered -32005 (rate limit) without a pause.
from=$DEPLOY_BLOCK
logs=""
while [ "$from" -le "$head" ]; do
  to=$((from + 9998)); [ "$to" -gt "$head" ] && to=$head
  filter="{\"address\":\"$CONTRACT\",\"fromBlock\":\"$(printf '0x%x' "$from")\",\"toBlock\":\"$(printf '0x%x' "$to")\"}"
  page=""
  for _ in 1 2 3; do
    page=$(rpc eth_getLogs "[$filter]")
    echo "$page" | jq -e '.result' >/dev/null 2>&1 && break
    sleep 2
  done
  if ! echo "$page" | jq -e '.result' >/dev/null 2>&1; then
    say PAGE "eth_getLogs failed for blocks $from-$to: $(echo "$page" | head -c 120)"
    exit 1
  fi
  logs="$logs$(echo "$page" | jq -c '.result[]')"$'\n'
  from=$((to + 1))
  sleep 1
done

payer_topic="0x$(cast to-uint256 "$PAYER" | sed 's/^0x//')"
count() { echo "$logs" | jq -c --arg t "$1" --arg p "${2:-}" 'select(.topics[0]==$t and ($p=="" or .topics[1]==$p))' | wc -l | tr -d ' '; }
added=$(count "$ADDED" "$payer_topic")
removed=$(count "$REMOVED" "$payer_topic")
if [ $((added - removed)) = "$EXPECTED_ALLOWED" ]; then
  say OK "allow-list events: $added added, $removed removed"
else
  say PAGE "allow-list events: $added added, $removed removed, record says net $EXPECTED_ALLOWED"
fi

# Usage counters. BatchPaid data is two 32-byte words: lineCount, then total in 6-decimal units.
paid=0
for data in $(echo "$logs" | jq -r --arg t "$BATCH" 'select(.topics[0]==$t) | .data'); do
  paid=$(echo "$paid + $(cast to-dec "0x${data:66:64}")" | bc)
done
say INFO "since block $DEPLOY_BLOCK: $(count "$BATCH") batches, $(count "$LINE") lines, $paid USDC units paid (6 decimals)"

exit "$failed"
