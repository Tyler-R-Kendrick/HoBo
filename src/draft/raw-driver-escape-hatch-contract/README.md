# Raw Driver Escape Hatch Contract

Independent proof package for HOBO-265.

It models `.raw(driver => ...)` as an explicitly non-portable, driver-typed read escape hatch over logical projections. Runtime tests prove portability and isolation debt are surfaced, projected-sink writes fail closed, and sinks without raw capability refuse raw calls. The TypeScript fixture proves wrong-driver dialect calls fail at compile time.
