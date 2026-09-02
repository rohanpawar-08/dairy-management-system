import { Component, Inject, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatIconModule } from '@angular/material/icon';
import { I18nService } from '../../../core/services/i18n.service';

export interface RestoreConfirmDialogData {
  displayName: string;
  sizeFormatted: string;
}

@Component({
  selector: 'app-restore-confirm-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatButtonModule,
    MatCheckboxModule,
    MatIconModule,
  ],
  template: `
    <div class="dialog-container" role="dialog" aria-labelledby="dialog-title" aria-describedby="dialog-desc">
      <h2 mat-dialog-title id="dialog-title" class="dialog-header">
        <mat-icon color="warn">warning</mat-icon>
        <span>{{ i18n.t('backupRestore.confirmDialog.title') }}</span>
      </h2>

      <mat-dialog-content id="dialog-desc" class="dialog-content">
        <div class="alert-box">
          <strong>{{ i18n.t('backupRestore.confirmDialog.warning') }}</strong>
        </div>

        <p class="desc-line">
          {{ i18n.t('backupRestore.confirmDialog.p1', { filename: data.displayName }) }}
        </p>

        <div class="file-summary">
          <div class="meta-row">
            <span class="meta-label">{{ i18n.t('backupRestore.candidateFilename') }}:</span>
            <span class="meta-value">{{ data.displayName }}</span>
          </div>
          <div class="meta-row">
            <span class="meta-label">{{ i18n.t('backupRestore.candidateSize') }}:</span>
            <span class="meta-value">{{ data.sizeFormatted }}</span>
          </div>
        </div>

        <p class="desc-line safe-note">
          <mat-icon>shield</mat-icon>
          <span>{{ i18n.t('backupRestore.confirmDialog.p2') }}</span>
        </p>

        <p class="desc-line restart-note">
          <mat-icon>restart_alt</mat-icon>
          <span>{{ i18n.t('backupRestore.confirmDialog.p3') }}</span>
        </p>

        <div class="acknowledgement-box">
          <mat-checkbox [(ngModel)]="isAcknowledged" color="warn">
            {{ i18n.t('backupRestore.confirmDialog.checkboxLabel') }}
          </mat-checkbox>
        </div>
      </mat-dialog-content>

      <mat-dialog-actions align="end" class="dialog-actions">
        <button mat-button type="button" [mat-dialog-close]="false" cdkFocusInitial>
          {{ i18n.t('backupRestore.confirmDialog.cancelBtn') }}
        </button>
        <button
          mat-flat-button
          color="warn"
          type="button"
          [disabled]="!isAcknowledged"
          [mat-dialog-close]="true"
        >
          <mat-icon>restore</mat-icon>
          {{ i18n.t('backupRestore.confirmDialog.confirmBtn') }}
        </button>
      </mat-dialog-actions>
    </div>
  `,
  styles: [`
    .dialog-container {
      padding: 1rem;
      max-width: 520px;
    }
    .dialog-header {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      margin: 0 0 1rem;
      color: #c62828;
      font-size: 1.25rem;
    }
    .alert-box {
      background: #ffebee;
      color: #c62828;
      padding: 0.75rem 1rem;
      border-radius: 4px;
      font-weight: 600;
      margin-bottom: 1rem;
    }
    .desc-line {
      margin: 0.75rem 0;
      line-height: 1.5;
    }
    .safe-note, .restart-note {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      color: #455a64;
      font-size: 0.9rem;
    }
    .file-summary {
      background: #f5f5f5;
      padding: 0.75rem 1rem;
      border-radius: 4px;
      margin: 1rem 0;
    }
    .meta-row {
      display: flex;
      justify-content: space-between;
      margin: 0.25rem 0;
    }
    .meta-label {
      color: #616161;
      font-weight: 500;
    }
    .meta-value {
      font-weight: 600;
      color: #212121;
    }
    .acknowledgement-box {
      margin-top: 1.25rem;
      padding-top: 1rem;
      border-top: 1px solid #e0e0e0;
    }
    .dialog-actions {
      margin-top: 1.5rem;
      display: flex;
      gap: 0.75rem;
    }
  `],
})
export class RestoreConfirmDialogComponent {
  public i18n = inject(I18nService);
  public isAcknowledged = false;

  constructor(
    public dialogRef: MatDialogRef<RestoreConfirmDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: RestoreConfirmDialogData
  ) {}
}
