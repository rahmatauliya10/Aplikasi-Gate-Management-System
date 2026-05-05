from PIL import Image

in_path = r"d:\Antigravity Project\Aplikasi Gate Management System\public\favicon.png"
out_path = r"d:\Antigravity Project\Aplikasi Gate Management System\public\logo_white.png"

try:
    img = Image.open(in_path)
    img = img.convert("RGBA")
    datas = img.getdata()
    new_data = []

    for item in datas:
        # If the pixel is not fully transparent, make it white.
        # We can keep the alpha channel intact to preserve anti-aliasing edges.
        if item[3] > 0:
            new_data.append((255, 255, 255, item[3]))
        else:
            new_data.append(item)

    img.putdata(new_data)
    img.save(out_path, "PNG")
    print(f"Success! {out_path} created as white logo.")

except Exception as e:
    print(f"Error: {e}")
