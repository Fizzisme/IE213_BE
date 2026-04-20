#!/usr/bin/env node

/**
 * 🔍 CHECK: Verify patient-doctor access grant status
 */

import { blockchainContracts } from '~/blockchain/contract.js';

const PATIENT_ADDRESS = '0xED95a81E6aB6bd4e42B267BFC4578533CCfA9fEB';
const DOCTOR_ADDRESS = '0xc8EfaCFd1c817483Dfb813E12d78cd0f8bB96778';

async function checkAccessGrant() {
    console.log('═'.repeat(70));
    console.log('🔍 ACCESS GRANT VERIFICATION');
    console.log('═'.repeat(70));

    try {
        // Method 1: getAccessGrant()
        console.log('\n📡 Method 1: getAccessGrant()');
        console.log(`   Patient: ${PATIENT_ADDRESS}`);
        console.log(`   Doctor:  ${DOCTOR_ADDRESS}`);

        const grant = await blockchainContracts.read.accessControl.getAccessGrant(
            PATIENT_ADDRESS,
            DOCTOR_ADDRESS
        );

        console.log(`\n✅ Access Grant Found:`);
        console.log(`   Level: ${grant.level} (0=NONE, 1=EMERGENCY, 2=FULL, 3=SENSITIVE)`);
        console.log(`   Active: ${grant.isActive}`);
        console.log(`   Expires At (unix): ${BigInt(grant.expiresAt).toString()}`);

        const now = Math.floor(Date.now() / 1000);
        const expiresAt = Number(BigInt(grant.expiresAt));

        console.log(`\n⏰ Expiration Status:`);
        console.log(`   Current time: ${now}`);
        console.log(`   Expires at: ${expiresAt}`);

        if (expiresAt === 0) {
            console.log(`   ✅ NO EXPIRATION (permanent grant)`);
        } else if (expiresAt > now) {
            const hoursLeft = Math.floor((expiresAt - now) / 3600);
            const minutesLeft = Math.floor(((expiresAt - now) % 3600) / 60);
            console.log(`   ⏳ expires in ${hoursLeft}h ${minutesLeft}m`);
        } else {
            const hoursAgo = Math.floor((now - expiresAt) / 3600);
            console.log(`   ❌ EXPIRED ${hoursAgo} hours ago!`);
        }

        // Method 2: checkAccessLevel()
        console.log(`\n\n📡 Method 2: checkAccessLevel() at RequiredLevel=2`);
        const hasAccess = await blockchainContracts.read.accessControl.checkAccessLevel(
            PATIENT_ADDRESS,
            DOCTOR_ADDRESS,
            2 // FULL level
        );
        console.log(`   Result: ${hasAccess ? '✅ TRUE (access OK)' : '❌ FALSE (access denied)'}`);

        console.log('\n' + '═'.repeat(70));

        // FIX SUGGESTION
        if (expiresAt > 0 && expiresAt <= now) {
            console.log('\n🔥 FIX: Access grant is EXPIRED!');
            console.log('   Patient must grant access again:');
            console.log('   PATCH /v1/access-control/grant');
            console.log('   {');
            console.log(`     "doctorAddress": "${DOCTOR_ADDRESS}",`);
            console.log('     "accessLevel": 2,');
            console.log('     "expirationDays": 365');
            console.log('   }');
        } else if (grant.level < 2) {
            console.log('\n🔥 FIX: Access level too low!');
            console.log(`   Current: ${grant.level}, Required: 2`);
            console.log('   Patient must re-grant with higher access level');
        } else {
            console.log('\n✅ Access grant looks OK - problem elsewhere');
        }

    } catch (error) {
        console.error('\n❌ ERROR:', error.message);
    }
}

checkAccessGrant();
