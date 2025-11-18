import pandas as pd
from sqlalchemy import create_engine, text
import time
import os

# --- Configuration ---
DB_USER = 'cosmic_admin'
DB_PASSWORD = 'Raghav' # IMPORTANT: Replace with your password
DB_HOST = 'localhost'
DB_PORT = '5432'
DB_NAME = 'cosmic_db'
TABLE_NAME = 'celestial_objects'
CSV_FILE_PATH = 'cosmic_full_dataset.csv'
CHUNK_SIZE = 10000

def clean_data(df):
    """
    Performs robust cleaning on a chunk of the dataframe.
    - It identifies known text columns and separates them.
    - For all other columns, it attempts to convert them to a numeric type.
    - It then fills any remaining NaNs appropriately.
    """
    # Define columns that should ALWAYS be treated as text
    known_text_cols = [
        'main_id', 'otype', 'sp_type', 'rvz_nature', 'coo_wavelength',
        'coo_bibcode', 'mesdistance.bibcode', 'mesdistance.method', 'mesdistance.unit'
    ]
    
    # Separate the text columns from the potentially numeric ones
    text_df = df[[col for col in known_text_cols if col in df.columns]]
    numeric_df = df.drop(columns=text_df.columns, errors='ignore')

    # Coerce all potentially numeric columns to numeric, turning errors into NaN
    for col in numeric_df.columns:
        numeric_df[col] = pd.to_numeric(numeric_df[col], errors='coerce')

    # Fill NaNs in the now purely numeric dataframe
    numeric_df = numeric_df.fillna(0)

    # Fill NaNs in the text dataframe
    text_df = text_df.fillna('Unknown').astype(str)

    # Recombine the cleaned dataframes
    return pd.concat([text_df, numeric_df], axis=1)

def main():
    """
    Main function to run the ETL process.
    """
    if not os.path.exists(CSV_FILE_PATH):
        print(f"Error: The file {CSV_FILE_PATH} was not found.")
        return

    engine_string = f"postgresql+psycopg2://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}"
    
    try:
        engine = create_engine(engine_string)
        with engine.connect():
            print("Successfully connected to the PostgreSQL database.")
    except Exception as e:
        print(f"Failed to connect to the database: {e}")
        return

    start_time = time.time()
    
    try:
        with engine.connect() as connection:
            connection.execute(text(f'DROP TABLE IF EXISTS {TABLE_NAME};'))
            # The commit is handled automatically by the 'with' block's end
        print(f"Table '{TABLE_NAME}' dropped successfully for a fresh start.")
    except Exception as e:
        print(f"Error dropping table: {e}")
        return

    with pd.read_csv(CSV_FILE_PATH, chunksize=CHUNK_SIZE, iterator=True, low_memory=False) as reader:
        print(f"Starting to load {CSV_FILE_PATH} into '{TABLE_NAME}' table...")
        
        is_first_chunk = True
        total_rows = 0
        for i, chunk in enumerate(reader):
            chunk_start_time = time.time()
            
            cleaned_chunk = clean_data(chunk)
            
            write_mode = 'replace' if is_first_chunk else 'append'
            cleaned_chunk.to_sql(TABLE_NAME, engine, if_exists=write_mode, index=False)
            
            total_rows += len(cleaned_chunk)
            chunk_end_time = time.time()
            
            if is_first_chunk:
                print(f"Processed and loaded the first {len(cleaned_chunk)} rows. Table '{TABLE_NAME}' created.")
                is_first_chunk = False
            else:
                print(f"  -> Loaded chunk {i+1} ({len(cleaned_chunk)} rows) in {chunk_end_time - chunk_start_time:.2f} seconds. Total rows: {total_rows}")

    end_time = time.time()
    print("\n--------------------------------------------------")
    print(f"🎉 ETL process completed successfully!")
    print(f"Total rows loaded into '{TABLE_NAME}': {total_rows}")
    print(f"Total time taken: {(end_time - start_time) / 60:.2f} minutes.")
    print("--------------------------------------------------")

if __name__ == "__main__":
    main()
