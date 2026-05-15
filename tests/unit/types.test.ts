import { describe, expect, it } from 'vitest';
import {
    PERMISSION_NAME_REGEX,
    ROUTING_KEY_REGEX,
    type EventEnvelope,
    type User,
} from '../../src/index.js';

describe('regexes', () => {
    it('PERMISSION_NAME_REGEX accepts valid names', () => {
        expect(PERMISSION_NAME_REGEX.test('crm.contacts.read')).toBe(true);
        expect(PERMISSION_NAME_REGEX.test('finance.invoices.manage')).toBe(true);
        expect(PERMISSION_NAME_REGEX.test('a.b.c')).toBe(true);
        expect(PERMISSION_NAME_REGEX.test('app_1.res_2.act_3')).toBe(true);
    });

    it('PERMISSION_NAME_REGEX rejects invalid names', () => {
        expect(PERMISSION_NAME_REGEX.test('CRM.contacts.read')).toBe(false);
        expect(PERMISSION_NAME_REGEX.test('crm.contacts')).toBe(false);
        expect(PERMISSION_NAME_REGEX.test('crm..read')).toBe(false);
        expect(PERMISSION_NAME_REGEX.test('1crm.contacts.read')).toBe(false);
        expect(PERMISSION_NAME_REGEX.test('crm.contacts.read.extra')).toBe(false);
    });

    it('ROUTING_KEY_REGEX matches event routing keys', () => {
        expect(ROUTING_KEY_REGEX.test('crm.contact.created')).toBe(true);
        expect(ROUTING_KEY_REGEX.test('helpdesk.ticket.escalated')).toBe(true);
        expect(ROUTING_KEY_REGEX.test('CRM.contact.created')).toBe(false);
    });
});

describe('type shapes (compile-time guards via runtime equality)', () => {
    it('User has expected wire-format keys', () => {
        const user: User = {
            id: '42',
            email: 'jan@example.com',
            name: 'Jan',
            roles: ['admin'],
            permissions: ['crm.contacts.read'],
            org_id: 1,
        };
        expect(Object.keys(user).sort()).toEqual(
            ['email', 'id', 'name', 'org_id', 'permissions', 'roles'].sort(),
        );
    });

    it('EventEnvelope accepts typed data parameter', () => {
        interface ContactCreated {
            contact_id: number;
            email: string;
        }
        const envelope: EventEnvelope<ContactCreated> = {
            event_id: 'uuid',
            event_type: 'crm.contact.created',
            timestamp: '2026-05-15T10:00:00.000Z',
            source: 'crm',
            version: '1.0',
            actor: { type: 'user', user_id: '42' },
            data: { contact_id: 100, email: 'a@b.c' },
            metadata: { correlation_id: 'cid' },
        };
        expect(envelope.data.contact_id).toBe(100);
        expect(envelope.event_type).toMatch(ROUTING_KEY_REGEX);
    });
});
