import { v7 as uuidv7 } from 'uuid';

export function nouvelUuid(): string {
    return uuidv7();
}
