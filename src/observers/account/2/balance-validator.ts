/**
 * Account Balance Validator
 * 
 * Business logic validator for account balance operations
 * Ring: 2 (Business) - Schema: account - Operations: create, update
 */

import { BaseObserver } from '@lib/observers/base-observer.js';
import { ValidationError, BusinessLogicError, ValidationWarning } from '@lib/observers/errors.js';
import type { ObserverContext } from '@lib/observers/interfaces.js';
import { ObserverRing } from '@lib/observers/types.js';

export default class BalanceValidator extends BaseObserver {
    readonly ring = ObserverRing.Business;
    readonly operations = ['create', 'update'] as const;

    async execute(context: ObserverContext): Promise<void> {
        const { data, existing, metadata, operation } = context;
        
        // Process data as array if needed
        const recordsToProcess = Array.isArray(data) ? data : [data];
        
        for (const record of recordsToProcess) {
            if (!record) continue;
            
            const recordContext = {
                ...context,
                data: record,
                existing: Array.isArray(existing) ? existing[recordsToProcess.indexOf(record)] : existing
            };

            // Validate balance is present and numeric for new accounts
            if (operation === 'create') {
                await this.validateNewAccount(recordContext);
            }
            
            // Validate balance changes for existing accounts
            if (operation === 'update' && recordContext.existing) {
                await this.validateBalanceUpdate(recordContext);
            }
        }
    }

    private async validateNewAccount(context: ObserverContext): Promise<void> {
        const { data } = context;
        
        // Ensure balance is provided for new accounts
        if (typeof data.balance !== 'number') {
            throw new ValidationError('Balance must be provided for new accounts', 'balance', 'BALANCE_REQUIRED');
        }

        // Business rule: New accounts cannot start with negative balance
        if (data.balance < 0) {
            throw new BusinessLogicError('New accounts cannot have negative starting balance', { balance: data.balance }, 'NEGATIVE_STARTING_BALANCE');
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
            throw new BusinessLogicError(
                `Transaction would exceed credit limit. Available credit: ${creditLimit}, attempted balance: ${newBalance}`,
                { creditLimit, newBalance, currentBalance },
                'CREDIT_LIMIT_EXCEEDED'
            );
        }

        // Business rule: Large balance changes require additional validation
        if (Math.abs(balanceChange) > 10000) {
            context.warnings.push(
                new ValidationWarning(
                    'Large balance change detected - may require additional approval',
                    'balance',
                    'LARGE_BALANCE_CHANGE'
                )
            );
            
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