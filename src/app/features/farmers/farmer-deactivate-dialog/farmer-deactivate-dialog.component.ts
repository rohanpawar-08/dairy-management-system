import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { TranslatePipe } from '../../../core/pipes/translate.pipe';
import { FarmerListDto } from '../../../../../shared/ipc-contracts';

export interface DeactivateDialogData {
  farmer: FarmerListDto;
}

@Component({
  selector: 'app-farmer-deactivate-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
    TranslatePipe,
  ],
  template: `
    <div class="deactivate-dialog">
      <h2 mat-dialog-title class="dialog-title">
        <mat-icon color="warn">warning</mat-icon>
        {{ 'farmers.deactivate_title' | translate }}
      </h2>

      <mat-dialog-content class="dialog-content">
        <p class="warning-text">
          {{ 'farmers.deactivate_confirm' | translate: { name: data.farmer.nameMr, code: data.farmer.memberCode } }}
        </p>
        <p class="sub-text">
          {{ 'farmers.deactivate_notice' | translate }}
        </p>

        <mat-form-field appearance="outline" class="full-width">
          <mat-label>{{ 'farmers.deactivate_reason' | translate }}</mat-label>
          <input
            matInput
            [(ngModel)]="reason"
            [placeholder]="'farmers.deactivate_reason_placeholder' | translate"
          />
        </mat-form-field>
      </mat-dialog-content>

      <mat-dialog-actions align="end">
        <button mat-button mat-dialog-close type="button">
          {{ 'common.cancel' | translate }}
        </button>
        <button
          mat-flat-button
          color="warn"
          type="button"
          (click)="confirm()"
        >
          {{ 'farmers.deactivate_button' | translate }}
        </button>
      </mat-dialog-actions>
    </div>
  `,
  styles: [
    `
      .deactivate-dialog {
        padding: 8px;
      }
      .dialog-title {
        display: flex;
        align-items: center;
        gap: 8px;
        color: #b91c1c;
        margin: 0 0 12px 0;
      }
      .warning-text {
        font-size: 15px;
        font-weight: 600;
        color: #1e293b;
        margin-bottom: 8px;
      }
      .sub-text {
        font-size: 13px;
        color: #64748b;
        margin-bottom: 16px;
      }
      .full-width {
        width: 100%;
      }
    `,
  ],
})
export class FarmerDeactivateDialogComponent {
  readonly dialogRef = inject(MatDialogRef<FarmerDeactivateDialogComponent>);
  readonly data = inject<DeactivateDialogData>(MAT_DIALOG_DATA);

  reason = '';

  confirm(): void {
    this.dialogRef.close({ confirmed: true, reason: this.reason.trim() || undefined });
  }
}
