import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import crypto from 'crypto';
import * as midtransClient from 'midtrans-client';

import type { MidtransWebhookDto } from '../transactions/dto';

export type MidtransPaymentMethod =
  | 'BANK_TRANSFER'
  | 'VIRTUAL_ACCOUNT'
  | 'VIRTUAL_ACCOUNT_BCA'
  | 'QRIS'
  | 'CREDIT_CARD';

@Injectable()
export class MidtransService {
  private readonly serverKey: string;
  private readonly clientKey: string;
  private readonly merchantId?: string;
  private readonly isProduction: boolean;

  constructor() {
    this.serverKey = process.env.MIDTRANS_SERVER_KEY || '';
    this.clientKey = process.env.MIDTRANS_CLIENT_KEY || '';
    this.merchantId = process.env.MIDTRANS_MERCHANT_ID;
    this.isProduction =
      (process.env.MIDTRANS_IS_PRODUCTION || 'false').toLowerCase() === 'true';

    if (!this.serverKey || !this.clientKey) {
      // Keep it explicit so misconfiguration fails fast.
      throw new Error(
        'Midtrans credentials missing (MIDTRANS_SERVER_KEY / MIDTRANS_CLIENT_KEY)',
      );
    }
  }

  verifySignature(dto: MidtransWebhookDto): void {
    // Midtrans webhook signature:
    // SHA512(order_id + status_code + gross_amount + serverkey)
    const expectedInput = `${dto.order_id}${dto.status_code}${dto.gross_amount}${this.serverKey}`;
    const expected = crypto
      .createHash('sha512')
      .update(expectedInput)
      .digest('hex');

    if (!dto.signature_key || dto.signature_key !== expected) {
      throw new UnauthorizedException('Invalid Midtrans webhook signature');
    }
  }

  /**
   * Create payment using Midtrans Core API so we can retrieve VA / QRIS URL.
   * Returns fields that should be persisted in `payment_transactions`.
   */
  async charge(args: {
    orderId: string;
    grossAmount: number; // integer
    method: MidtransPaymentMethod;
    customerEmail: string;
  }): Promise<{
    midtransTransactionStatus: string;
    paymentType: string;
    vaNumber?: string;
    qrisUrl?: string;
    bankDetails?: {
      bankName: string;
      accountNumber: string;
      accountHolder: string;
    };
  }> {
    const coreApi = new midtransClient.CoreApi({
      isProduction: this.isProduction,
      serverKey: this.serverKey,
      clientKey: this.clientKey,
    });

    const { orderId, grossAmount, method, customerEmail } = args;
    const customer_details = { email: customerEmail };

    if (!Number.isFinite(grossAmount) || grossAmount <= 0) {
      throw new BadRequestException('Invalid gross_amount for Midtrans');
    }

    // Map FE payment methods to Midtrans core `payment_type`.
    switch (method) {
      case 'BANK_TRANSFER':
      case 'VIRTUAL_ACCOUNT':
      case 'VIRTUAL_ACCOUNT_BCA': {
        const resp: any = await coreApi.charge({
          payment_type: 'bank_transfer',
          transaction_details: {
            order_id: orderId,
            gross_amount: grossAmount,
          },
          bank_transfer: {
            bank: 'bca',
          },
          customer_details,
        });

        const vaNumbers = resp?.va_numbers as
          | Array<{ va_number: string }>
          | undefined;
        const vaNumber = vaNumbers?.[0]?.va_number;
        if (!vaNumber) {
          throw new BadRequestException('Midtrans did not return VA number');
        }

        return {
          midtransTransactionStatus: resp?.transaction_status || 'pending',
          paymentType: resp?.payment_type || 'bank_transfer',
          vaNumber,
          bankDetails: {
            bankName: 'BCA',
            accountNumber: vaNumber,
            accountHolder: 'MAXWELL (Midtrans)',
          },
        };
      }

      case 'QRIS': {
        const resp: any = await coreApi.charge({
          payment_type: 'qris',
          transaction_details: {
            order_id: orderId,
            gross_amount: grossAmount,
          },
          item_details: [
            {
              id: orderId,
              price: grossAmount,
              quantity: 1,
              name: 'Store Order',
            },
          ],
          customer_details,
          qris: { acquirer: 'gopay' },
        });

        const actions: Array<{ url?: string }> | undefined = resp?.actions;
        const qrisUrl = actions?.find((a) => a?.url)?.url;

        return {
          midtransTransactionStatus: resp?.transaction_status || 'pending',
          paymentType: resp?.payment_type || 'qris',
          qrisUrl: qrisUrl || undefined,
        };
      }

      case 'CREDIT_CARD': {
        // Core credit card needs token_id from frontend (3DS / secure flow).
        // We intentionally block until FE passes token_id.
        throw new BadRequestException(
          'CREDIT_CARD not supported in Core API flow without token_id',
        );
      }

      default:
        throw new BadRequestException(`Unsupported payment method: ${method}`);
    }
  }

  /**
   * Create Midtrans Snap token (used to open the Midtrans hosted payment page).
   */
  async createSnapToken(args: {
    orderId: string; // must match payment_transactions."orderId" for webhook correlation
    grossAmount: number; // integer
    customerEmail: string;
    enabledPayments?: string[];
  }): Promise<{
    token: string;
    redirect_url?: string;
    snapTransactionId?: string;
  }> {
    const snap = new (midtransClient as any).Snap({
      isProduction: this.isProduction,
      serverKey: this.serverKey,
      clientKey: this.clientKey,
    });

    const { orderId, grossAmount, customerEmail, enabledPayments } = args;

    if (!Number.isFinite(grossAmount) || grossAmount <= 0) {
      throw new BadRequestException('Invalid gross_amount for Midtrans Snap');
    }

    const basePayload: any = {
      transaction_details: {
        order_id: orderId,
        gross_amount: grossAmount,
      },
      customer_details: {
        email: customerEmail,
      },
      // Item details often improves transaction validity for Snap.
      item_details: [
        {
          id: orderId,
          price: grossAmount,
          quantity: 1,
          name: 'Store Order',
        },
      ],
    };

    const payload = {
      ...basePayload,
      // If enabledPayments is not passed, don't override snap preference.
      ...(enabledPayments && enabledPayments.length > 0
        ? { enabled_payments: enabledPayments }
        : {}),
    };

    const resp: any = await snap.createTransaction(payload);

    const token: string | undefined = resp?.token;
    if (!token) {
      throw new BadRequestException('Midtrans Snap token missing');
    }

    return {
      token,
      redirect_url: resp?.redirect_url,
      snapTransactionId: resp?.transaction_id,
    };
  }
}
