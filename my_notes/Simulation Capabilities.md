I want to extend the current Simulation capabilities of this project.

Plan for this and clarify.  Then we will do a simulation.

1. Any event that has an Event code with a "Demo" field, use that field to determine if a simulation will run, see sql for tables
2. When a demo mode is detected:
   - First the simulation will start and run in the background continuously based upon these rules.
   - All actions done here by the simulation will not affect the database but will simulate these actions in the database locally as needed.
   - All races after race 4 will be marked as not completed.
   - The simulation will start with race number 5 for this event and then simulate races in order up to race 10.
   - The simulation will not wait until the "Active Page" is active, and the active Page link for starting a simulation will not be available.
   - There will be a simulate timing value of "SIMULATE_SECS" and one for "SIMULATE_LAPS"
3. The Simulation Process
   - The simulation will run each race starting from race 5 in a similar manner to the existing simulation process.
   - Starts with Simulate "Staging" with empty timing records for each participant. after SIMULATE_SECS secs move to "Active" state.   Allow user to Pause race.
   - On Active State, simulate as before until SIMULATE_LAPS have been completed. Then move to "Finished State".
   - On Finished State, show as finished for SIMULATE_SECS and then move to the next race and repeat the process until the 10th race is completed.
   - After the 10th race is completed repeat the process starting with race number 5 again.
   - After each race "Finishes" it will be considered as "Complete".  The results page will then be able to show results if they actually exist in the database. Use the actual Results from the database, do not simulate these.
   - The Race order page should show the race being simulated as the Active Race
   - Warning and next race messages should be triggered from the Active Race being simulated.

1.