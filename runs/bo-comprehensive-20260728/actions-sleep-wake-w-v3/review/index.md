# actions-sleep-wake-w-v3 Review

Quick review page for the `w` facing `sleep_wake` animation. Mode: `image`. Frames: `10`. FPS: `8`.

## Review Assets

### Generated Sheet

Full opaque pose board produced by the image model. Image size: `1536x1152`. Expected generation canvas: `1536x1152`.

![Generated Sheet](../generated/sheet.png)

[Open file](../generated/sheet.png)

### Rough Grid Review Crops

First `10` implied grid cells cropped from the pose board for review only. These are not the runtime source of truth. Generation grid: `4x3`. Cell size: `384x384`. Review image size: `1688x204`.

![Rough Grid Review Crops](grid-review-cell-contact.png)

[Open file](grid-review-cell-contact.png)

### Rough Grid Review GIF

Implied grid crops looped for geometry review only. GIF canvas: `256x256`.

![Rough Grid Review GIF](grid-review-cell-preview.gif)

[Open file](grid-review-cell-preview.gif)

### Recovered Component Contact Sheet

Foreground components recovered from the full pose board and ordered by the declared grid. These recovered components are the runtime source. Review image size: `1660x204`.

![Recovered Component Contact Sheet](recovered-component-contact.png)

[Open file](recovered-component-contact.png)

### Recovered Native Contact Sheet

Recovered components placed on a shared padded native review canvas without scaling. This is the first animation review checkpoint before pixel snap or 256x256 runtime normalization. Review image size: `1518x204`.

![Recovered Native Contact Sheet](recovered-native-contact.png)

[Open file](recovered-native-contact.png)

### Recovered Native Preview GIF

Recovered components looped on the padded native review canvas before runtime normalization. GIF canvas: `400x448`.

![Recovered Native Preview GIF](recovered-native-preview.gif)

[Open file](recovered-native-preview.gif)

### Comparison 01: Grid Review To Recovered Components

Before/after comparison showing why implied grid crops are review artifacts only. Review image size: `1297x352`.

![Comparison 01: Grid Review To Recovered Components](compare-01-grid-review-to-recovered-components.png)

[Open file](compare-01-grid-review-to-recovered-components.png)

### Comparison 02: Recovered Components To Native Layout

Before/after comparison showing variable-size recovered components padded to a shared native review canvas without scaling. Review image size: `1272x352`.

![Comparison 02: Recovered Components To Native Layout](compare-02-recovered-to-native-layout.png)

[Open file](compare-02-recovered-to-native-layout.png)

### Comparison 06: Cleaned To Scaled

Before/after comparison for cleanup output to shared-scale layout input. Review image size: `1268x352`.

![Comparison 06: Cleaned To Scaled](compare-02-cleaned-to-scaled.png)

[Open file](compare-02-cleaned-to-scaled.png)

### Comparison 07: Scaled To Normalized

Before/after comparison for final placement into runtime cells. Review image size: `1298x352`.

![Comparison 07: Scaled To Normalized](compare-03-scaled-to-normalized.png)

[Open file](compare-03-scaled-to-normalized.png)

### Normalized Contact Sheet

Final normalized frames after cleanup, scaling, and baseline alignment.

![Normalized Contact Sheet](contact.png)

[Open file](contact.png)

### Normalized Preview GIF

Final runtime-cell animation preview.

![Normalized Preview GIF](preview.gif)

[Open file](preview.gif)

### Runtime Spritesheet

Game-facing transparent spritesheet export. Image size: `1280x512`.

![Runtime Spritesheet](../export/spritesheet.png)

[Open file](../export/spritesheet.png)

### Runtime Preview GIF

Copy of the final preview GIF bundled with the export. GIF canvas: `256x256`.

![Runtime Preview GIF](../export/preview.gif)

[Open file](../export/preview.gif)

### Export Manifest

Machine-readable export metadata.

[Open file](../export/manifest.json)

### Baseline Report

Baseline and center audit from the final spritesheet.

[Open file](../export/baseline-report.json)
