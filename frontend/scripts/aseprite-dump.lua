-- Prints every layer of an .aseprite file (frame 1) as JSON: its name and its pixels as [x, y, "#RRGGBB"].
-- Layers inside groups are listed by their own name; hidden layers are listed too.
-- aseprite -b --script-param file=<path> --script aseprite-dump.lua
local spr = app.open(app.params.file)
local out = {}
local function hex(c) return string.format("#%02X%02X%02X", c.red, c.green, c.blue) end
local function walk(layers)
  for _, layer in ipairs(layers) do
    if layer.isGroup then
      walk(layer.layers)
    elseif layer.isImage then
      local px = {}
      local cel = layer:cel(1)
      if cel then
        local img, pos = cel.image, cel.position
        for it in img:pixels() do
          local v = it()
          local c
          if img.colorMode == ColorMode.RGB then
            if app.pixelColor.rgbaA(v) > 0 then
              c = Color{ r = app.pixelColor.rgbaR(v), g = app.pixelColor.rgbaG(v), b = app.pixelColor.rgbaB(v) }
            end
          elseif img.colorMode == ColorMode.INDEXED then
            if v ~= spr.transparentColor then c = spr.palettes[1]:getColor(v) end
          end
          if c and c.alpha > 0 then
            px[#px + 1] = string.format('[%d,%d,"%s"]', it.x + pos.x, it.y + pos.y, hex(c))
          end
        end
      end
      out[#out + 1] = string.format('{"name":%q,"visible":%s,"pixels":[%s]}', layer.name, tostring(layer.isVisible), table.concat(px, ","))
    end
  end
end
walk(spr.layers)
print(string.format('{"width":%d,"height":%d,"layers":[%s]}', spr.width, spr.height, table.concat(out, ",")))
