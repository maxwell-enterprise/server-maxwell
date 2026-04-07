import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../../common/database/database.service';

export interface YouthMetricRow {
  id: string;
  schoolName: string;
  contactPerson: string;
  status: string;
  studentsImpacted: number;
  programType: string;
}

const ALLOWED_STATUS = new Set(['LEAD', 'MOU_SIGNED', 'PROGRAM_ACTIVE']);
const ALLOWED_PROGRAM = new Set(['iChoose', 'iDo', 'iLead']);

@Injectable()
export class YouthImpactService {
  constructor(private readonly db: DatabaseService) {}

  private rowToDto(r: Record<string, unknown>): YouthMetricRow {
    return {
      id: String(r.id ?? ''),
      schoolName: String(r.school_name ?? ''),
      contactPerson: String(r.contact_person ?? ''),
      status: String(r.status ?? 'LEAD'),
      studentsImpacted: Number(r.students_impacted ?? 0),
      programType: String(r.program_type ?? 'iChoose'),
    };
  }

  async list(): Promise<YouthMetricRow[]> {
    const result = await this.db.query<Record<string, unknown>>(
      `SELECT id, school_name, contact_person, status, students_impacted, program_type
       FROM youth_metrics
       ORDER BY school_name ASC`,
    );
    return result.rows.map((row) => this.rowToDto(row));
  }

  async getById(id: string): Promise<YouthMetricRow> {
    const result = await this.db.query<Record<string, unknown>>(
      `SELECT id, school_name, contact_person, status, students_impacted, program_type
       FROM youth_metrics WHERE id = $1`,
      [id],
    );
    const row = result.rows[0];
    if (!row) throw new NotFoundException('Youth metric not found');
    return this.rowToDto(row);
  }

  async upsert(
    idFromUrl: string,
    body: Record<string, unknown>,
  ): Promise<void> {
    const id = String(body.id ?? idFromUrl);
    const schoolName = String(body.schoolName ?? '');
    const contactPerson = String(body.contactPerson ?? '');
    const status = String(body.status ?? 'LEAD');
    const studentsImpacted = Number(body.studentsImpacted ?? 0);
    const programType = String(body.programType ?? 'iChoose');

    if (!schoolName.trim()) {
      throw new BadRequestException('schoolName is required');
    }
    if (!ALLOWED_STATUS.has(status)) {
      throw new BadRequestException(
        `status must be one of: ${[...ALLOWED_STATUS].join(', ')}`,
      );
    }
    if (!ALLOWED_PROGRAM.has(programType)) {
      throw new BadRequestException(
        `programType must be one of: ${[...ALLOWED_PROGRAM].join(', ')}`,
      );
    }

    await this.db.query(
      `INSERT INTO youth_metrics (id, school_name, contact_person, status, students_impacted, program_type)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (id) DO UPDATE SET
         school_name = EXCLUDED.school_name,
         contact_person = EXCLUDED.contact_person,
         status = EXCLUDED.status,
         students_impacted = EXCLUDED.students_impacted,
         program_type = EXCLUDED.program_type,
         updated_at = now()`,
      [
        id,
        schoolName,
        contactPerson,
        status,
        Number.isFinite(studentsImpacted) ? studentsImpacted : 0,
        programType,
      ],
    );
  }

  async delete(id: string): Promise<void> {
    const result = await this.db.query(
      `DELETE FROM youth_metrics WHERE id = $1`,
      [id],
    );
    if (result.rowCount === 0) {
      throw new NotFoundException('Youth metric not found');
    }
  }
}
