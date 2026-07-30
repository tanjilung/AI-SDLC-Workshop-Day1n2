import { getHolidayDB } from '../lib/db';
import { singaporeHolidays } from '../lib/singapore-holidays';

getHolidayDB().upsertMany(singaporeHolidays);
console.log(`Seeded ${singaporeHolidays.length} Singapore holidays.`);
