# Hero Calibration Quality Report

**Date:** 2026-04-10
**Transform type:** polynomial1 (affine: translate + scale + rotate + shear)
**GCPs used in fit:** 15 (8 cable endpoints + 7 cities — 4 country labels excluded)
**Total GCPs collected:** 19

## Residual errors (fit points only)

| Max | Mean | Median |
|-----|------|--------|
| 26.2 px | 13.6 px | 12.4 px |

On a 1024px-wide image, max error is ~2.5% of width.

## Per-GCP error table

| ID | Actual px,py | Computed px,py | Error px | In fit? |
|----|-------------|----------------|---------|---------|
| nordbalt-se | 109,761 | 133,761 | 24.0 | yes |
| nordbalt-lt | 515,882 | 511,890 | 8.9 | yes |
| litpol-lt | 722,1058 | 723,1056 | 2.2 | yes |
| litpol-pl | 612,1137 | 607,1133 | 6.4 | yes |
| estlink-ee | 737,403 | 735,404 | 2.2 | yes |
| estlink-fi | 715,299 | 737,297 | 22.1 | yes |
| fennoskan-se | 299,281 | 276,280 | 23.0 | yes |
| fennoskan-fi | 535,189 | 510,181 | 26.2 | yes |
| sweden-label | 153,430 | 274,421 | 121.3 | NO (excluded) |
| lithuania-label | 715,935 | 710,991 | 56.2 | NO (excluded) |
| latvia-label | 838,730 | 715,723 | 123.2 | NO (excluded) |
| estonia-label | 811,481 | 748,397 | 105.0 | NO (excluded) |
| vilnius | 820,1031 | 809,1016 | 18.6 | yes |
| kaunas | 717,991 | 710,991 | 7.0 | yes |
| klaipeda | 506,885 | 511,890 | 7.1 | yes |
| riga | 702,712 | 715,723 | 17.0 | yes |
| daugavpils | 903,857 | 891,860 | 12.4 | yes |
| tallinn | 726,396 | 748,397 | 22.0 | yes |
| tartu | 892,528 | 894,533 | 5.4 | yes |

## Notes

- Country labels were excluded from the fit because they are approximate
  (center of large text, not precise geographic points). Their residuals
  (56-123 px) confirm this was the right call.
- The highest fit errors (fennoskan-fi 26.2, nordbalt-se 24.0, fennoskan-se 23.0)
  are all at the edges of the map where the illustrative projection diverges
  most from real geography. This is expected and acceptable.
- Baltic interior points (Kaunas, Vilnius, Tartu, Klaipėda) have low errors
  (5-18 px), which is where most project dots will land.

## Geocoded project positions

| Project | Lat/Lng | Pixel x,y | Source |
|---------|---------|-----------|--------|
| BSP Hertz 1 (Kiisa) | 59.200, 24.567 | 736,428 | manual |
| Eesti Energia (Auvere) | 59.327, 27.883 | 971,407 | manual |
| E energija | 54.785, 24.659 | 765,1004 | manual |
| Kruonis PSP | 54.781, 24.069 | 723,1006 | manual |
| Energy Cells (Kruonis) | 54.781, 24.069 | 723,1006 | manual |
| AST BESS (Rēzekne) | 56.510, 27.333 | 946,776 | manual |
| Utilitas Targale | 57.191, 21.892 | 556,694 | manual |
| AJ Power (Valmiera) | 57.541, 25.426 | 805,644 | manual |

## Country centroid positions

| Country | Pixel x,y |
|---------|-----------|
| Lithuania | 708,955 |
| Latvia | 750,731 |
| Estonia | 771,507 |
