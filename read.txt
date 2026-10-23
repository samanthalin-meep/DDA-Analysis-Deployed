DDALAB POOLED REQUIRED FILES

This folder contains everything necessary to run DDALAB for pooled cross-trial 
analysis of averaged EEG electrodes and plot experimental conditions.


WHAT IS IN THIS FOLDER

DDALAB Pooled.app		Adapted version of open-source DDALab (v1.2.10)
DDA_Analysis_Manual.pdf		Manual for DDA pooled cross-trial analysis				
DDA_prep.m		EEG preparation and CSV export in one file 
data/
	I1_R3_Conditions.csv	Used to determine conditions used for each trial 
	I1_R3.ed 		Processed EEG data 
	I1_R3_Log.txt		Used to cross check data
eeglab2026.0.0/			EEGLAB with the installed import/filter plugins
erplab12.20/			ERPLAB functions used by preparation
programs/			Contains eeglab and erplab 

Follow 'DDA_Analysis_Manual.pdf' to complete analysis
MATLAB R2025a was used and is required


HOW TO RUN

1. Open DDA_prep.m in MATLAB and run DDA_prep.
2. Select the data folder containing exactly ONE .edf recording, ONE .txt
   EEG acquisition log and ONE .csv conditions table. Filenames can vary.
   The CSV must contain sec_time and label columns.
3. Enter the Recording ID, select electrodes/conditions and confirm preparation.
   The new Recording ID folder is created inside the selected data folder:
     [RecordingID]/DDA_[RecordingID].csv
     [RecordingID]/DDA_[RecordingID]_Counts.csv
   Make separate adds an electrode suffix to each data CSV.
4. Open DDALab Pooled and import DDA_[RecordingID].csv to analyze and graph it.

Keep input files directly inside the chosen data folder. A missing file or
more than one EDF, TXT or CSV stops preparation with an error naming the
file type (and duplicate filenames). Subfolders are not searched.
The programs folder is used automatically; you do not need to open its files.
