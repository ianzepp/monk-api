/**
 * Account Balance Validator
 * 
 * Business logic validator for account balance operations
 * Ring: 2 (Business) - Schema: account - Operations: create, update
 */

import type { Observer, ObserverContext } from '../../../lib/observers/interfaces.js';
import { ObserverRing } from '../../../lib/observers/types.js';

export default class BalanceValidator implements Observer {
    ring = ObserverRing.Business;
    operations = ['create', 'update'] as const;
    name = 'BalanceValidator';

    async execute(context: ObserverContext): Promise<void> {
        const { data, existing, metadata, operation } = context;
        
        if (!data) return;

        // Validate balance is present and numeric for new accounts
        if (operation === 'create') {
            await this.validateNewAccount(context);
        }
        
        // Validate balance changes for existing accounts
        if (operation === 'update' && existing) {
            await this.validateBalanceUpdate(context);
        }
    }

    private async validateNewAccount(context: ObserverContext): Promise<void> {
        const { data } = context;
        
        // Ensure balance is provided for new accounts
        if (typeof data.balance !== 'number') {
            context.errors.push({
                message: 'Balance must be provided for new accounts',
                field: 'balance',
                code: 'BALANCE_REQUIRED',
                ring: this.ring,
                observer: this.name
            });
            return;
        }

        // Business rule: New accounts cannot start with negative balance
        if (data.balance < 0) {
            context.errors.push({
                message: 'New accounts cannot have negative starting balance',
                field: 'balance',
                code: 'NEGATIVE_STARTING_BALANCE',
                ring: this.ring,
                observer: this.name
            });
        }

        // Store initial balance for other observers
        context.metadata.set('initial_balance', data.balance);
    }

    private async validateBalanceUpdate(context: ObserverContext): Promise<void> {
        const { data, existing, metadata } = context;
        
        if (typeof data.balance !== 'number') {
            return; // No balance update
        }

        const currentBalance = existing.balance || 0;
        const newBalance = data.balance;
        const balanceChange = newBalance - currentBalance;
        const creditLimit = existing.credit_limit || 0;

        // Store balance change for other observers
        metadata.set('balance_change', balanceChange);
        metadata.set('previous_balance', currentBalance);

        // Business rule: Cannot exceed credit limit on negative balance changes
        if (balanceChange < 0 && Math.abs(newBalance) > creditLimit) {
            context.errors.push({
                message: `Transaction would exceed credit limit. Available credit: ${creditLimit}, attempted balance: ${newBalance}`,
                field: 'balance',
                code: 'CREDIT_LIMIT_EXCEEDED',
                ring: this.ring,
                observer: this.name
            });
        }

        // Business rule: Large balance changes require additional validation
        if (Math.abs(balanceChange) > 10000) {
            context.warnings.push({
                message: 'Large balance change detected - may require additional approval',
                field: 'balance',
                code: 'LARGE_BALANCE_CHANGE',
                ring: this.ring,
                observer: this.name
            });
            
            // Flag for audit systems
            metadata.set('requires_audit', true);
            metadata.set('large_transaction', true);
        }

        // Add transaction type classification
        if (balanceChange > 0) {
            metadata.set('transaction_type', 'credit');
        } else if (balanceChange < 0) {
            metadata.set('transaction_type', 'debit');
        }
    }
}