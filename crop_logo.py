from PIL import Image

image_path = r"C:\Users\plant03\.gemini\antigravity\brain\dd2b6b57-3500-4b57-a45a-eb91abe1c531\media__1775033188658.png"
out_favicon = r"d:\Antigravity Project\Aplikasi Gate Management System\public\favicon.png"

try:
    favicon = Image.open(image_path)
    print(f"Original Size: {favicon.size}")
    
    # Convert white background to transparent
    favicon = favicon.convert("RGBA")
    datas = favicon.getdata()
    new_data = []
    
    # Tolerance for off-white pixels
    threshold = 240
    
    for item in datas:
        # Check if the pixel is mostly white
        if item[0] > threshold and item[1] > threshold and item[2] > threshold:
            new_data.append((255, 255, 255, 0)) # transparent
        else:
            new_data.append(item)
            
    favicon.putdata(new_data)
    
    # Trim transparent edges
    bbox = favicon.getbbox()
    if bbox:
        favicon = favicon.crop(bbox)
        
    # Resize to a reasonable favicon size (e.g., 256x256 makes a good sharp ICO/PNG format)
    favicon = favicon.resize((256, 256), Image.Resampling.LANCZOS)
        
    favicon.save(out_favicon, "PNG")
    print(f"Success! {out_favicon} created and processed with transparent background.")

except Exception as e:
    print(f"Error: {e}")
