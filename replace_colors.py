import os
import re

def process_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    replacements = {
        # Indigo -> Dark Blue (#4A8BDF)
        r'#6366F1': '#4A8BDF',
        r'#4F46E5': '#3A6ABF',
        r'99,102,241': '74,139,223',
        r'99,\s*102,\s*241': '74,139,223',
        r'bg-indigo-500': 'bg-[#4A8BDF]',
        r'bg-indigo-50': 'bg-[#E6F0FA]',
        r'text-indigo-500': 'text-[#4A8BDF]',
        r'text-indigo-400': 'text-[#4A8BDF]',
        r'border-indigo-500': 'border-[#4A8BDF]',
        r'border-indigo-400': 'border-[#4A8BDF]',
        r'border-indigo-100': 'border-[#CCE0F5]',
        r'ring-indigo-500': 'ring-[#4A8BDF]',

        # Cyan -> Eggplant (#A0006D)
        r'#06B6D4': '#A0006D',
        r'6,\s*182,\s*212': '160,0,109',
        r'bg-cyan-500': 'bg-[#A0006D]',
        r'text-cyan-500': 'text-[#A0006D]',

        # Emerald / Green (Keep or change? The user said "ganti semua kombinasinya mengikuti paduan 3 warna tersebut". So Green -> Dark Blue or Eggplant?)
        # Let's map Emerald to Dark Blue for now, or just leave it for OK/Success states? 
        # Wait, the prompt says: "jadikan Biru pucat, biru tua, terong 3 warna tersebut kombinasi... ganti SEMUA kombinasinya mengikuti paduan 3 warna tersebut"
        # Emerald -> Dark Blue
        r'#059669': '#4A8BDF',
        r'#10B981': '#3A6ABF',
        r'#047857': '#2A4A9F',
        r'16,\s*185,\s*129': '74,139,223',
        r'5,\s*150,\s*105': '58,106,191',
        r'bg-emerald-500': 'bg-[#4A8BDF]',
        r'bg-emerald-400': 'bg-[#66A2E1]',
        r'text-emerald-500': 'text-[#4A8BDF]',
        r'text-emerald-600': 'text-[#3A6ABF]',
        
        # Amber / Warning
        # Amber -> Eggplant
        r'#D97706': '#A0006D',
        r'#F59E0B': '#800057',
        r'245,\s*158,\s*11': '160,0,109',
        r'bg-amber-500': 'bg-[#A0006D]',
        r'text-amber-500': 'text-[#A0006D]',
        r'text-amber-600': 'text-[#800057]',

        # Dark Backgrounds -> Pale Blue (#EFFAFD) and White
        r'#0B1121': '#EFFAFD',
        r'#020817': '#EFFAFD',
        r'#0D1526': '#FFFFFF',
        r'#111827': '#FFFFFF',
        r'#0F172A': '#FFFFFF',
        r'#1E293B': '#E6F0FA',  # lighter shade for gradients
        r'#080F1E': '#EFFAFD',
        
        # Text adjustments
        # text-white on light bg is invisible. We should change text-white to text-slate-800 EXCEPT where it's explicitly on a dark button.
        # It's safer to just change text-slate-300, text-slate-400 to text-slate-600
        r'text-slate-300': 'text-slate-600',
        r'text-slate-400': 'text-slate-600',
        r'text-slate-500': 'text-slate-700',
        r'text-white': 'text-[#4A8BDF]', # Many headers use text-white. Buttons that have text-white usually use Tailwind classes. We'll change text-white to text-[#4A8BDF] and fix buttons if they break.
    }

    new_content = content
    for pattern, replacement in replacements.items():
        new_content = re.sub(pattern, replacement, new_content, flags=re.IGNORECASE)

    # Revert text-[#4A8BDF] inside primary buttons
    # Buttons often have 'bg-[#4A8BDF] text-[#4A8BDF]' after this replacement.
    # Let's fix that.
    new_content = re.sub(r'bg-\[\#4A8BDF\](\s+)text-\[\#4A8BDF\]', r'bg-[#4A8BDF]\1text-white', new_content)
    new_content = re.sub(r'bg-\[\#A0006D\](\s+)text-\[\#4A8BDF\]', r'bg-[#A0006D]\1text-white', new_content)
    
    # Fix inline styles with text-white replacements
    new_content = re.sub(r'color:\s*#4A8BDF', r'color: #4A8BDF', new_content) # normalize

    if new_content != content:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(new_content)
        print(f"Updated {filepath}")

def main():
    src_dir = r"d:\Antigravity Project\Aplikasi Gate Management System\src"
    for root, dirs, files in os.walk(src_dir):
        for file in files:
            if file.endswith('.vue') or file.endswith('.js'):
                process_file(os.path.join(root, file))

if __name__ == "__main__":
    main()
