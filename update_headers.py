import os
import re

def process_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Simple regex to find the header
    # They usually look like:
    # <div>\n  <h1...>Title <span...>(Subtitle)</span></h1>\n  <p...>Description</p>\n</div>
    # Or in GateCheckIn:
    # <!-- Page Header -->\n<div class="flex justify-between items-center mb-7">\n  <div>\n    <h1 ...>Gate Check-In\n      <span ...>(Security)</span>\n    </h1>\n    <p ...>Truck Registration Portal</p>\n  </div>\n  ... </div> (might have date on the right)
    
    # Since there are variations, we can target each specific known string
    replacements = [
        # GBB
        (r'<div>\s*<h1 class="text-2xl font-black text-slate-900 tracking-tight"[^>]*>GBB Warehouse <span[^>]*>\(Raw Material\)</span></h1>\s*<p class="text-xs font-bold text-slate-600 uppercase tracking-widest mt-0\.5">Unloading Operations</p>\s*</div>',
         r'<PageHeader title="GBB Warehouse (Raw Material)" subtitle="Unloading Operations" />'),
        # GBJ
        (r'<div>\s*<h1 class="text-2xl font-black text-slate-900 tracking-tight"[^>]*>GBJ Warehouse <span[^>]*>\(Finished Goods\)</span></h1>\s*<p class="text-xs font-bold text-slate-600 uppercase tracking-widest mt-0\.5">Loading Operations</p>\s*</div>',
         r'<PageHeader title="GBJ Warehouse (Finished Goods)" subtitle="Loading Operations" />'),
        # GSP
        (r'<div>\s*<h1 class="text-2xl font-black text-slate-900 tracking-tight"[^>]*>GSP Warehouse <span[^>]*>\(Process\)</span></h1>\s*<p class="text-xs font-bold text-slate-600 uppercase tracking-widest mt-0\.5">Processing Operations</p>\s*</div>',
         r'<PageHeader title="GSP Warehouse (Process)" subtitle="Processing Operations" />'),
         # GateCheckIn
        (r'<!-- Page Header -->\s*<div class="flex justify-between items-center mb-7">\s*<div>\s*<h1 class="text-2xl font-black text-slate-900 tracking-tight"[^>]*>Gate Check-In\s*<span[^>]*>\(Security\)</span>\s*</h1>\s*<p class="text-xs font-bold text-slate-600 uppercase tracking-widest mt-0\.5">Truck Registration Portal</p>\s*</div>\s*<div class="text-right hidden sm:block">\s*<p class="text-sm font-black text-slate-800">{{ currentDate }}</p>\s*<p class="text-\[10px\] font-bold text-slate-500 uppercase tracking-widest">{{ currentTime }}</p>\s*</div>\s*</div>',
         r'<PageHeader title="Gate Check-In (Security)" subtitle="Truck Registration Portal" />'),
         # GateCheckOut
        (r'<!-- Page Header -->\s*<div class="flex justify-between items-center mb-7">\s*<div>\s*<h1 class="text-2xl font-black text-slate-900 tracking-tight"[^>]*>Gate Check-Out\s*<span[^>]*>\(Security\)</span>\s*</h1>\s*<p class="text-xs font-bold text-slate-600 uppercase tracking-widest mt-0\.5">Final Exit & Document Handover</p>\s*</div>\s*</div>',
         r'<PageHeader title="Gate Check-Out (Security)" subtitle="Final Exit & Document Handover" />'),
         # Weighbridge
        (r'<!-- Page Header -->\s*<div class="flex justify-between items-center mb-7">\s*<div>\s*<h1 class="text-2xl font-black text-slate-900 tracking-tight"[^>]*>Weighbridge Station\s*</h1>\s*<p class="text-xs font-bold text-slate-600 uppercase tracking-widest mt-0\.5">Gross & Tare Weight Measurement</p>\s*</div>\s*</div>',
         r'<PageHeader title="Weighbridge Station" subtitle="Gross & Tare Weight Measurement" />'),
         # QCVerification
        (r'<!-- Page Header -->\s*<div class="flex justify-between items-center mb-7">\s*<div>\s*<h1 class="text-2xl font-black text-slate-900 tracking-tight"[^>]*>QC Verification\s*<span[^>]*>\(Quality Control\)</span>\s*</h1>\s*<p class="text-xs font-bold text-slate-600 uppercase tracking-widest mt-0\.5">Quality Approval & Analysis</p>\s*</div>\s*</div>',
         r'<PageHeader title="QC Verification (Quality Control)" subtitle="Quality Approval & Analysis" />'),
         # History
        (r'<!-- Page Header -->\s*<div class="flex justify-between items-end mb-6">\s*<div>\s*<h1 class="text-2xl font-black text-slate-900 tracking-tight"[^>]*>Transaction History</h1>\s*<p class="text-xs font-bold text-slate-600 uppercase tracking-widest mt-0\.5">Completed & Rejected Records</p>\s*</div>\s*<div class="hidden sm:block">\s*<div class="relative">\s*<span class="material-icons absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">search</span>\s*<input v-model="searchQuery" type="text" placeholder="Search plate or vendor..." class="pl-9 pr-4 py-2 bg-white rounded-xl text-sm font-medium border border-slate-200 outline-none focus:border-\[#4A8BDF\] focus:ring-2 focus:ring-\[#4A8BDF\]/20 transition-all shadow-sm w-64">\s*</div>\s*</div>\s*</div>',
         r'<PageHeader title="Transaction History" subtitle="Completed & Rejected Records" />\n    <div class="hidden sm:block mb-6">\n      <div class="relative">\n        <span class="material-icons absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">search</span>\n        <input v-model="searchQuery" type="text" placeholder="Search plate or vendor..." class="pl-9 pr-4 py-2 bg-white rounded-xl text-sm font-medium border border-slate-200 outline-none focus:border-[#4A8BDF] focus:ring-2 focus:ring-[#4A8BDF]/20 transition-all shadow-sm w-64">\n      </div>\n    </div>'),
         # Settings
        (r'<div>\s*<h1 class="text-2xl font-black text-slate-900 tracking-tight"[^>]*>System Settings</h1>\s*<p class="text-xs font-bold text-slate-600 uppercase tracking-widest mt-0\.5">Parameters & Configuration</p>\s*</div>',
         r'<PageHeader title="System Settings" subtitle="Parameters & Configuration" badgeText="Configuration" badgeColor="text-indigo-400" />')
    ]
    
    new_content = content
    modified = False
    for pattern, replacement in replacements:
        if re.search(pattern, new_content):
            new_content = re.sub(pattern, replacement, new_content)
            modified = True
            
    if modified:
        # Add import PageHeader
        if 'import PageHeader' not in new_content:
            new_content = re.sub(r'(<script setup>\n)', r'\1import PageHeader from \'../components/PageHeader.vue\'\n', new_content)
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(new_content)
        print(f"Updated {filepath}")

def main():
    src_dir = r"d:\Antigravity Project\Aplikasi Gate Management System\src\views"
    for root, dirs, files in os.walk(src_dir):
        for file in files:
            if file.endswith('.vue') and file != 'Dashboard.vue':
                process_file(os.path.join(root, file))

if __name__ == "__main__":
    main()
