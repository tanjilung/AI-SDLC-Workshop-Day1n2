import { getHolidayDB } from '../lib/db';
import { singaporeHolidays } from '../lib/singapore-holidays';

singaporeHolidays.forEach((holiday) => getHolidayDB().create(holiday));
console.log(`Seeded ${singaporeHolidays.length} Singapore holidays.`);
