import { customAlphabet } from 'nanoid';

const nanoidNumbers = customAlphabet('0123456789', 5);
const nanoidAlphaNum = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 2);

/**
 * Generate KEY-XXXXX-XX format ID
 */
export function generateKeyId() {
  return `KEY-${nanoidNumbers()}-${nanoidAlphaNum()}`;
}

/**
 * Generate LOG-XXXXX-XX format ID
 */
export function generateLogId() {
  return `LOG-${nanoidNumbers()}-${nanoidAlphaNum()}`;
}

/**
 * Generate CLOG-XXXXX-XX format ID for CreationLog
 */
export function generateCreationLogId() {
  return `CLOG-${nanoidNumbers()}-${nanoidAlphaNum()}`;
}

/**
 * Generate random API key
 */
export function generateApiKey() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  const nanoid = customAlphabet(alphabet, 32);
  return nanoid();
}

/**
 * Generate email username
 * Format: firstname.lastname + random digits
 */
export function generateEmailUsername() {
  const name = generateRealName();
  const nanoid = customAlphabet('0123456789', 4);
  const first = name.givenName.toLowerCase();
  const last = name.familyName.toLowerCase();
  // Formats: firstname.lastname123, f.lastname1234, firstname.l1234
  const formats = [
    `${first}.${last}${nanoid()}`,
    `${first}${last.charAt(0)}${nanoid()}`,
    `${first.charAt(0)}.${last}${nanoid()}`,
    `${first}.${last.charAt(0)}${nanoid()}`,
    `${first}${nanoid()}`,
  ];
  return formats[Math.floor(Math.random() * formats.length)];
}

/**
 * Generate realistic first and last name pair
 */
export function generateRealName() {
  const firstNames = [
    'James', 'Robert', 'John', 'Michael', 'David', 'William', 'Richard', 'Joseph',
    'Thomas', 'Christopher', 'Charles', 'Daniel', 'Matthew', 'Anthony', 'Mark',
    'Steven', 'Paul', 'Andrew', 'Joshua', 'Kenneth', 'Kevin', 'Brian', 'George',
    'Timothy', 'Ronald', 'Edward', 'Jason', 'Jeffrey', 'Ryan', 'Jacob',
    'Mary', 'Patricia', 'Jennifer', 'Linda', 'Barbara', 'Elizabeth', 'Susan',
    'Jessica', 'Sarah', 'Karen', 'Lisa', 'Nancy', 'Betty', 'Margaret', 'Sandra',
    'Ashley', 'Dorothy', 'Kimberly', 'Emily', 'Donna', 'Michelle', 'Carol',
    'Amanda', 'Melissa', 'Deborah', 'Stephanie', 'Rebecca', 'Sharon', 'Laura',
    'Cynthia', 'Kathleen', 'Amy', 'Angela', 'Shirley', 'Anna', 'Brenda',
    'Pamela', 'Emma', 'Nicole', 'Helen', 'Samantha', 'Katherine', 'Christine',
    'Debra', 'Rachel', 'Carolyn', 'Janet', 'Catherine', 'Maria', 'Heather',
    'Diane', 'Ruth', 'Julie', 'Olivia', 'Joyce', 'Virginia', 'Victoria',
    'Kelly', 'Lauren', 'Christina', 'Joan', 'Evelyn', 'Judith', 'Andrea',
    'Hannah', 'Megan', 'Cheryl', 'Jacqueline', 'Martha', 'Gloria', 'Teresa',
    'Ann', 'Sara', 'Madison', 'Frances', 'Kathryn', 'Janice', 'Jean', 'Abigail',
    'Alice', 'Judy', 'Sophia', 'Grace', 'Denise', 'Amber', 'Doris', 'Marilyn',
    'Danielle', 'Beverly', 'Isabella', 'Theresa', 'Diana', 'Natalie', 'Brittany',
    'Charlotte', 'Marie', 'Kayla', 'Alexis', 'Lori'
  ];

  const lastNames = [
    'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis',
    'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson',
    'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin', 'Lee', 'Perez', 'Thompson',
    'White', 'Harris', 'Sanchez', 'Clark', 'Ramirez', 'Lewis', 'Robinson',
    'Walker', 'Young', 'Allen', 'King', 'Wright', 'Scott', 'Torres', 'Nguyen',
    'Hill', 'Flores', 'Green', 'Adams', 'Nelson', 'Baker', 'Hall', 'Rivera',
    'Campbell', 'Mitchell', 'Carter', 'Roberts', 'Gomez', 'Phillips', 'Evans',
    'Turner', 'Diaz', 'Parker', 'Cruz', 'Edwards', 'Collins', 'Reyes', 'Stewart',
    'Morris', 'Morales', 'Murphy', 'Cook', 'Rogers', 'Gutierrez', 'Ortiz',
    'Morgan', 'Cooper', 'Peterson', 'Bailey', 'Reed', 'Kelly', 'Howard', 'Ramos',
    'Kim', 'Cox', 'Ward', 'Richardson', 'Watson', 'Brooks', 'Chavez', 'Wood',
    'James', 'Bennett', 'Gray', 'Mendoza', 'Ruiz', 'Hughes', 'Price', 'Alvarez',
    'Castillo', 'Sanders', 'Patel', 'Myers', 'Long', 'Ross', 'Foster', 'Jimenez'
  ];

  return {
    givenName: firstNames[Math.floor(Math.random() * firstNames.length)],
    familyName: lastNames[Math.floor(Math.random() * lastNames.length)]
  };
}
