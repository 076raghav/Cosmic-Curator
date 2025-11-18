import pandas as pd
import os
from glob import glob

output_folder = "sky_scrape_output"
all_files = sorted(glob(os.path.join(output_folder, "objects_part_*.csv")))

print(f"📂 Found {len(all_files)} files to merge.")

merged_df = pd.concat([pd.read_csv(file) for file in all_files], ignore_index=True)
print(f"✅ Merged shape: {merged_df.shape}")

merged_df.to_csv("cosmic_full_dataset.csv", index=False)
print("🚀 Final dataset saved as 'cosmic_full_dataset.csv'")
