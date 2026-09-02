import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { I18nService } from '../../core/services/i18n.service';
import { BackupRestoreStateService } from '../../core/services/backup-restore-state.service';
import { RestoreConfirmDialogComponent } from './restore-confirm-dialog/restore-confirm-dialog.component';

@Component({
  selector: 'app-backup-restore',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatTableModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
    MatDialogModule,
  ],
  templateUrl: './backup-restore.component.html',
  styleUrls: ['./backup-restore.component.scss'],
})
export class BackupRestoreComponent implements OnInit {
  public i18n = inject(I18nService);
  public state = inject(BackupRestoreStateService);
  private router = inject(Router);
  private dialog = inject(MatDialog);

  public displayedColumns: string[] = ['filename', 'size', 'trigger', 'verification', 'date'];

  ngOnInit(): void {
    this.state.loadHistory();
  }

  public navigateToDashboard(): void {
    this.router.navigate(['/dashboard']);
  }

  public async handleCreateBackup(): Promise<void> {
    await this.state.createBackup();
  }

  public async handleSelectDestinationAndBackup(): Promise<void> {
    await this.state.selectDestinationAndBackup();
  }

  public async handleSelectCandidate(): Promise<void> {
    await this.state.selectRestoreCandidate();
  }

  public handleClearCandidate(): void {
    this.state.clearCandidate();
  }

  public openRestoreConfirmDialog(): void {
    const candidate = this.state.selectedCandidate();
    if (!candidate || !candidate.token) return;

    const dialogRef = this.dialog.open(RestoreConfirmDialogComponent, {
      width: '520px',
      data: {
        displayName: candidate.displayName || 'backup.db',
        sizeFormatted: this.state.formatBytes(candidate.sizeBytes || 0),
      },
    });

    dialogRef.afterClosed().subscribe(async (confirmed: boolean) => {
      if (confirmed && candidate.token) {
        await this.state.executeRestore(candidate.token);
      }
    });
  }

  public getTriggerLabel(triggerType: string): string {
    switch (triggerType) {
      case 'MANUAL':
        return this.i18n.t('backupRestore.triggerManual');
      case 'AUTOMATIC_SHIFT_CLOSE':
        return this.i18n.t('backupRestore.triggerShiftClose');
      case 'PRE_RESTORE_SAFETY':
        return this.i18n.t('backupRestore.triggerPreRestore');
      default:
        return triggerType;
    }
  }

  public formatDate(dateStr: string): string {
    if (!dateStr) return '-';
    try {
      const d = new Date(dateStr);
      return d.toLocaleString(this.i18n.isMarathi() ? 'mr-IN' : 'en-IN');
    } catch {
      return dateStr;
    }
  }
}
