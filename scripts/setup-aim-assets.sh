#!/bin/bash

# Create the aim directory if it doesn't exist
mkdir -p static/aim

# Create icons for the buttons
magick -size 24x24 xc:transparent \
    -fill black -stroke black -strokewidth 2 \
    -draw "circle 12,12 12,2" \
    -draw "path 'M12,8 L12,14 M12,16 L12,17'" \
    static/aim/help-icon.png

magick -size 24x24 xc:transparent \
    -fill black -stroke black -strokewidth 2 \
    -draw "path 'M4,12 L20,12 M12,4 L12,20'" \
    static/aim/setup-icon.png

magick -size 24x24 xc:transparent \
    -fill black -stroke black -strokewidth 2 \
    -draw "circle 12,12 12,2" \
    -draw "path 'M8,12 L16,12 M12,8 L12,16'" \
    static/aim/signin-icon.png 