#!/usr/bin/env bash
# Open every notch view and plugin panel, screenshot the top-centre area, close again.
Q="qs -p /usr/share/omarchy/shell ipc call"; OUT=shots
snap(){ sleep 2; grim -g "400,0 1800x1100" "$OUT/$1.png"; }
done_(){ $Q kalinewb.face close >/dev/null 2>&1; $Q notch collapse >/dev/null 2>&1; sleep 0.8; }
for v in widgets clock battery settings menu plugins; do $Q notch view $v >/dev/null 2>&1; snap "notch-$v"; done_; done
for v in setup people person remove settings test; do $Q kalinewb.face open $v "" >/dev/null 2>&1; snap "face-$v"; done_; done
for t in harshith.system-monitor io.github.therealasclepius.touchpad-comfortable io.voxtype.settings kalinewb.egpu omapods omarchy.audio omarchy.bluetooth omarchy.clock omarchy.elsewhen omarchy.monitor omarchy.network omarchy.tailscale omarchy.task-manager omarchy.weather onlyvishesh.power-manager power-manager; do
  $Q "$t" open >/dev/null 2>&1; snap "panel-$t"; $Q "$t" close >/dev/null 2>&1; done_; done
echo finished
