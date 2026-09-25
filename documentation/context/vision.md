<!--
  Product Vision — maintained by the Autopilot Architect.
  Lives in the PROJECT ROOT and is loaded into every agent's context (like CLAUDE.md),
  so keep it CONCISE: a shared north star every play must conform to, not a spec.
-->

# Product Vision

## Problem
Coimbra Metrobus riders can't easily see where the buses are right now or how soon one
will reach their stop, so deciding when to leave home or work is guesswork.

## Vision
A mobile-first web app that opens straight onto a map showing where you are, your nearest
Metrobus stop, the live position of every Metrobus bus, and how many minutes each
approaching bus is from that stop. You look at it and decide when to leave.

## Target users
- **Primary: the owner.** A regular Metrobus rider checking a phone before heading out.
  They need to see at a glance how far away the next buses are.
- **Secondary: any Metrobus rider** with the same need. They use it anonymously, with
  nothing to set up.

## Core value & principles
- **Glanceable.** Open it, see the map, get the answer in seconds. The map is the product.
- **Real time, honestly labelled.** Bus positions and "minutes away" update continuously. Until
  a live feed exists, they are estimated from the timetable and clearly labelled "scheduled". Live
  data replaces the estimates when it becomes available. Estimated or stale data is never shown
  as live.
- **Location-aware.** Use the device's location to find the nearest stop automatically.
- **Mobile first.** Designed for a phone screen and one-handed use. Desktop is secondary.
- **Simple over featureful.** Show information and let the user decide. No planning logic.

## Non-goals
- No other transport: Metrobus only (no SMTUC, trains or other operators).
- No user accounts, sign-in, profiles or saved favourites.
- No trip or route planning, no walking-time calculation, no "leave now" recommendations.
- No push notifications or alerts.
