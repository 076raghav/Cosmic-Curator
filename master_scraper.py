from astroquery.simbad import Simbad
from astropy.coordinates import SkyCoord
import astropy.units as u
import pandas as pd
import time
from tqdm import tqdm

# Custom SIMBAD instance with all extended fields
custom_simbad = Simbad()
custom_simbad.TIMEOUT = 1200  # long timeout
custom_simbad.ROW_LIMIT = -1  # return all rows

# Add all available votable fields
custom_simbad.add_votable_fields(
    'ra', 'dec', 'otype', 'sp_type', 'pmra', 'pmdec', 'plx_value', 'rvz_nature',
    'B', 'V', 'R', 'G', 'U', 'I',
    'J', 'H', 'K', 'mesdistance', 'rvz_redshift',
    'galdim_majaxis', 'galdim_minaxis', 'galdim_angle'
)

# Parameters
RA_STEPS = 72  # RA: 0 to 360 in 5° steps (360/5 = 72)
DEC_STEPS = 36  # Dec: -90 to +90 in 5° steps (180/5 = 36)
RADIUS = 0.5 * u.deg  # search radius
BATCH_LIMIT = 1000  # objects per region
SAVE_EVERY_N = 1000  # save after this many total objects
OUTPUT_FOLDER = "sky_scrape_output"
TOTAL_OBJECTS_TARGET = 10000000  # adjust as per RAM/time

# Initialize variables
master_data = []
total_count = 0
file_index = 1

print("🌌 Starting sky scan...")

for ra_step in tqdm(range(RA_STEPS)):
    for dec_step in range(DEC_STEPS):
        if total_count >= TOTAL_OBJECTS_TARGET:
            break

        ra = ra_step * 5
        dec = -90 + dec_step * 5
        coord = SkyCoord(ra=ra, dec=dec, unit=(u.deg, u.deg), frame='icrs')

        try:
            result = custom_simbad.query_region(coord, radius=RADIUS)

            if result is not None and len(result) > 0:
                df = result.to_pandas()
                master_data.append(df)
                total_count += len(df)

                if total_count % SAVE_EVERY_N < len(df):
                    full_df = pd.concat(master_data, ignore_index=True)
                    full_df.to_csv(f"{OUTPUT_FOLDER}/objects_part_{file_index}.csv", index=False)
                    print(f"✅ Saved batch {file_index} with {len(full_df)} objects")
                    file_index += 1
                    master_data = []

            time.sleep(0.3)  # avoid SIMBAD rate limiting

        except Exception as e:
            print(f"❌ Error at RA={ra}, Dec={dec}: {e}")
            time.sleep(5)

# Final save if any left
if master_data:
    final_df = pd.concat(master_data, ignore_index=True)
    final_df.to_csv(f"{OUTPUT_FOLDER}/objects_part_{file_index}.csv", index=False)
    print(f"✅ Final save batch {file_index} with {len(final_df)} objects")

print("🎉 Full sky scan completed.")
