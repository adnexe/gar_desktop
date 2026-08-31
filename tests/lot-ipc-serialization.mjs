import assert from 'node:assert/strict';
import { ref } from 'vue';

const selection = ref(['courrier-1', 'courrier-2']);

assert.throws(
    () => structuredClone(selection.value),
    /could not be cloned|clone/i,
    'Le test doit reproduire le rejet du Proxy Vue par structured clone.',
);

const payload = {
    agenceId: 1,
    type: 'courrier',
    date: '2026-08-29',
    userId: 1,
    elementUuids: [...selection.value],
};
const payloadClone = structuredClone(payload);

assert.deepEqual(payloadClone.elementUuids, ['courrier-1', 'courrier-2']);
assert.notStrictEqual(payloadClone.elementUuids, selection.value);

const retraitPayload = structuredClone({
    uuid: '99999999-aaaa-4999-8999-999999999999',
    userId: 1,
    elementUuids: [...selection.value],
});
assert.deepEqual(retraitPayload.elementUuids, ['courrier-1', 'courrier-2']);

console.log('OK - les payloads de création et de retrait de lot sont sérialisables par Electron IPC.');
