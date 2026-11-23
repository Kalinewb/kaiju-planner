#!/usr/bin/env bash
# For the panels that open only by clicking their widget (Camera Test, Omaland, Keybindings,
# Lock Explorer, Arc Dock, Spotify, ...). For each name: a notification says which panel to open,
# you open it, and 8 seconds later the whole screen is captured into the output folder.
#   scripts/capture-by-hand.sh [outdir] [name ...]
out=${1:-$HOME/Work/plans/omarchy-notch/live-captures}; shift || true
names=("$@"); [ ${#names[@]} -eq 0 ] && names=(camera-test omaland keybindings lock-explorer arc-dock spotify needs-attention face-record face-test)
mkdir -p "$out"
for n in "${names[@]}"; do
  notify-send -t 7000 "Capture: open $n" "Opening it now. Screenshot in 8 seconds."
  echo "open: $n (8 s)"; sleep 8
  grim "$out/$n.png" && echo "saved $out/$n.png"
  notify-send -t 2500 "Captured $n" "Close it before the next one."; sleep 4
done
echo done
