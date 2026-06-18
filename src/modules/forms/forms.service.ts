import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DbService } from '../../common/db.service';
import { MembersService } from '../members/members.service';
import type { JwtUserPayload } from '../auth/auth.service';
import {
  CreateDeploymentDtoSchema,
  QuestionDto,
  SubmitFormResponseDtoSchema,
  UpsertFormDtoSchema,
} from './dto/forms.dto';

type FormRow = {
  internalId: string;
  id: string;
  title: string;
  description: string | null;
  isQuiz: boolean;
  questions: QuestionDto[];
  successMessage: string | null;
  active: boolean;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
};

type DeploymentRow = {
  internalId: string;
  id: string;
  formId: string;
  name: string;
  eventId: string | null;
  createdAt: string;
};

type ResponseRow = {
  id: string;
  formId: string;
  deploymentId: string | null;
  userId: string | null;
  memberId: string | null;
  userName: string | null;
  userEmail: string | null;
  userPhone: string | null;
  answers: Record<string, unknown>;
  score: number | null;
  maxScore: number | null;
  submittedAt: string;
  metadata: Record<string, unknown>;
};

@Injectable()
export class FormsService {
  constructor(
    private readonly db: DbService,
    private readonly members: MembersService,
  ) {}

  async listForms(): Promise<unknown[]> {
    const res = await this.db.query<FormRow>(
      `
      select
        f.id::text as "internalId",
        coalesce(nullif(trim(f.public_id), ''), f.id::text) as id,
        f.title,
        f.description,
        f.is_quiz as "isQuiz",
        f.questions,
        f.success_message as "successMessage",
        f.active,
        f.created_by as "createdBy",
        f.created_at as "createdAt",
        f.updated_at as "updatedAt"
      from forms f
      order by f.created_at desc
      `,
    );
    const forms = await Promise.all(
      res.rows.map(async (row) => ({
        ...this.toFormContract(row),
        sessions: await this.listDeploymentsForForm(row.internalId),
      })),
    );
    return forms;
  }

  async getForm(identifier: string): Promise<unknown> {
    const row = await this.findFormRow(identifier);
    return {
      ...this.toFormContract(row),
      sessions: await this.listDeploymentsForForm(row.internalId),
    };
  }

  async upsertForm(
    user: JwtUserPayload,
    body: Record<string, unknown>,
  ): Promise<unknown> {
    const dto = UpsertFormDtoSchema.parse(body ?? {});
    const publicId =
      dto.id?.trim() ||
      `FRM-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

    const existing = await this.db.query<{ internalId: string }>(
      `
      select f.id::text as "internalId"
      from forms f
      where f.public_id = $1 or f.id::text = $1
      limit 1
      `,
      [publicId],
    );
    const existingId = existing.rows[0]?.internalId;

    if (existingId) {
      const updated = await this.db.query<FormRow>(
        `
        update forms
        set
          title = $2,
          description = $3,
          is_quiz = $4,
          questions = $5::jsonb,
          success_message = $6,
          active = $7,
          updated_at = now()
        where id = $1::uuid
        returning
          id::text as "internalId",
          coalesce(nullif(trim(public_id), ''), id::text) as id,
          title,
          description,
          is_quiz as "isQuiz",
          questions,
          success_message as "successMessage",
          active,
          created_by as "createdBy",
          created_at as "createdAt",
          updated_at as "updatedAt"
        `,
        [
          existingId,
          dto.title.trim(),
          dto.description?.trim() || null,
          dto.isQuiz,
          JSON.stringify(dto.questions),
          dto.successMessage?.trim() || null,
          dto.active,
        ],
      );
      const row = updated.rows[0];
      if (!row) throw new NotFoundException('Form not found');
      return {
        ...this.toFormContract(row),
        sessions: await this.listDeploymentsForForm(row.internalId),
      };
    }

    const inserted = await this.db.query<FormRow>(
      `
      insert into forms (
        public_id,
        title,
        description,
        is_quiz,
        questions,
        success_message,
        active,
        created_by,
        created_at,
        updated_at
      )
      values ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, now(), now())
      returning
        id::text as "internalId",
        coalesce(nullif(trim(public_id), ''), id::text) as id,
        title,
        description,
        is_quiz as "isQuiz",
        questions,
        success_message as "successMessage",
        active,
        created_by as "createdBy",
        created_at as "createdAt",
        updated_at as "updatedAt"
      `,
      [
        publicId,
        dto.title.trim(),
        dto.description?.trim() || null,
        dto.isQuiz,
        JSON.stringify(dto.questions),
        dto.successMessage?.trim() || null,
        dto.active,
        user.sub?.trim() || null,
      ],
    );
    const row = inserted.rows[0];
    return { ...this.toFormContract(row), sessions: [] };
  }

  async deleteForm(identifier: string): Promise<void> {
    const row = await this.findFormRow(identifier);
    await this.db.query(`delete from forms where id = $1::uuid`, [
      row.internalId,
    ]);
  }

  async addDeployment(
    formIdentifier: string,
    body: Record<string, unknown>,
  ): Promise<unknown> {
    const form = await this.findFormRow(formIdentifier);
    const dto = CreateDeploymentDtoSchema.parse(body ?? {});
    const publicId = `SES-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    const res = await this.db.query<DeploymentRow>(
      `
      insert into form_deployments (
        public_id,
        form_id,
        name,
        event_id,
        created_at
      )
      values ($1, $2::uuid, $3, $4, now())
      returning
        id::text as "internalId",
        coalesce(nullif(trim(public_id), ''), id::text) as id,
        name,
        event_id as "eventId",
        created_at as "createdAt"
      `,
      [
        publicId,
        form.internalId,
        dto.name.trim(),
        dto.eventId?.trim() || null,
      ],
    );
    const row = res.rows[0];
    return this.toDeploymentContract(
      { ...row, formId: form.id },
      form.id,
    );
  }

  async deleteDeployment(
    formIdentifier: string,
    deploymentIdentifier: string,
  ): Promise<void> {
    const form = await this.findFormRow(formIdentifier);
    const deployment = await this.findDeploymentRow(
      deploymentIdentifier,
      form.internalId,
    );
    await this.db.query(`delete from form_deployments where id = $1::uuid`, [
      deployment.internalId,
    ]);
  }

  async getPublicFormPayload(
    formId: string,
    sessionId?: string | null,
  ): Promise<unknown> {
    const form = await this.findFormRow(formId);
    if (!form.active) {
      throw new NotFoundException('Form is not available');
    }
    let session: DeploymentRow | null = null;
    if (sessionId?.trim()) {
      session = await this.findDeploymentRow(sessionId.trim(), form.internalId);
    }
    return {
      form: this.toFormContract(form),
      session: session ? this.toDeploymentContract(session, form.id) : null,
    };
  }

  async submitResponse(
    user: JwtUserPayload | null,
    body: Record<string, unknown>,
  ): Promise<unknown> {
    const dto = SubmitFormResponseDtoSchema.parse(body ?? {});
    const form = await this.findFormRow(dto.formId);
    if (!form.active) {
      throw new BadRequestException('Form is not accepting responses');
    }

    let deployment: DeploymentRow | null = null;
    if (dto.sessionId?.trim()) {
      deployment = await this.findDeploymentRow(
        dto.sessionId.trim(),
        form.internalId,
      );
    }

    const isGuest = !user?.sub?.trim();
    let userName = user?.email?.trim() || '';
    let userEmail = user?.email?.trim().toLowerCase() || '';
    let userPhone = '';
    let memberId: string | null = null;

    if (isGuest) {
      if (!dto.guestContact) {
        throw new BadRequestException(
          'Contact information is required for guest respondents',
        );
      }
      userName = dto.guestContact.name.trim();
      userEmail = dto.guestContact.email.trim().toLowerCase();
      userPhone = dto.guestContact.phone.trim();

      const lead = await this.members.upsertFormRespondentLead({
        fullName: userName,
        email: userEmail,
        phone: userPhone,
        formTitle: form.title,
        deploymentId: deployment?.id ?? null,
        eventId: deployment?.eventId ?? null,
      });
      memberId = lead.member.id;
    } else {
      userEmail = user?.email?.trim().toLowerCase() || '';
      if (userEmail) {
        const existing = await this.members.findMemberIdByEmail(userEmail);
        if (existing) {
          memberId = existing;
          const member = await this.members.findOne(existing);
          userName = member.name;
          userPhone = member.phone || '';
        }
      }
      memberId = memberId || user?.sub?.trim() || null;
    }

    const { score, maxScore } = form.isQuiz
      ? this.scoreQuiz(form.questions, dto.answers)
      : { score: null, maxScore: null };

    const publicId = `RSP-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    const metadata = {
      deploymentName: deployment?.name ?? null,
      eventId: deployment?.eventId ?? null,
      formTitle: form.title,
      isGuest,
    };

    const inserted = await this.db.query<ResponseRow>(
      `
      insert into form_responses (
        public_id,
        form_id,
        deployment_id,
        user_id,
        member_id,
        user_name,
        user_email,
        user_phone,
        answers,
        score,
        max_score,
        submitted_at,
        metadata
      )
      values (
        $1,
        $2::uuid,
        $3::uuid,
        $4,
        $5,
        $6,
        $7,
        $8,
        $9::jsonb,
        $10,
        $11,
        now(),
        $12::jsonb
      )
      returning
        coalesce(nullif(trim(public_id), ''), id::text) as id,
        user_id as "userId",
        member_id as "memberId",
        user_name as "userName",
        user_email as "userEmail",
        user_phone as "userPhone",
        answers,
        score,
        max_score as "maxScore",
        submitted_at as "submittedAt",
        metadata
      `,
      [
        publicId,
        form.internalId,
        deployment?.internalId ?? null,
        user?.sub?.trim() || null,
        memberId,
        userName || null,
        userEmail || null,
        userPhone || null,
        JSON.stringify(dto.answers ?? {}),
        score,
        maxScore,
        JSON.stringify(metadata),
      ],
    );

    return {
      ...inserted.rows[0],
      formId: form.id,
      sessionId: deployment?.id ?? null,
      successMessage: form.successMessage,
    };
  }

  async getReports(formIdentifier: string): Promise<unknown> {
    const form = await this.findFormRow(formIdentifier);
    const deployments = await this.listDeploymentsForForm(form.internalId);
    const responses = await this.listResponsesForForm(form.internalId);

    const eventIds = deployments
      .map((d) => d.eventId)
      .filter((id): id is string => !!id?.trim());
    const eventMap = await this.loadEventsMap(eventIds);

    const sessionStats = deployments.map((session) => {
      const sessionResponses = responses.filter(
        (r) => r.deploymentId === session.id,
      );
      let attendanceRatio: number | null = null;
      const linkedEvent = session.eventId
        ? eventMap[session.eventId] ?? null
        : null;
      if (linkedEvent && linkedEvent.attendees > 0) {
        attendanceRatio = Math.round(
          (sessionResponses.length / linkedEvent.attendees) * 100,
        );
      }
      let sessionAvgScore: number | null = null;
      if (form.isQuiz && sessionResponses.length > 0) {
        sessionAvgScore = Math.round(
          sessionResponses.reduce((sum, r) => sum + (r.score ?? 0), 0) /
            sessionResponses.length,
        );
      }
      return {
        ...session,
        responseCount: sessionResponses.length,
        attendanceRatio,
        linkedEvent,
        sessionAvgScore,
      };
    });

    const avgScore =
      form.isQuiz && responses.length > 0
        ? Math.round(
            responses.reduce((sum, r) => sum + (r.score ?? 0), 0) /
              responses.length,
          )
        : null;

    return {
      form: this.toFormContract(form),
      deployments: sessionStats,
      responses: responses.map((row) => this.toResponseContract(row)),
      summary: {
        totalResponses: responses.length,
        avgScore,
        directResponses: responses.filter((r) => !r.deploymentId).length,
      },
    };
  }

  async listMyResponses(user: JwtUserPayload): Promise<unknown[]> {
    const userId = user.sub?.trim();
    const email = user.email?.trim().toLowerCase() || '';
    if (!userId && !email) return [];

    const res = await this.db.query<
      ResponseRow & {
        formTitle: string;
        isQuiz: boolean;
        questions: QuestionDto[];
      }
    >(
      `
      select
        coalesce(nullif(trim(r.public_id), ''), r.id::text) as id,
        coalesce(nullif(trim(f.public_id), ''), f.id::text) as "formId",
        coalesce(nullif(trim(d.public_id), ''), d.id::text) as "deploymentId",
        r.user_id as "userId",
        r.member_id as "memberId",
        r.user_name as "userName",
        r.user_email as "userEmail",
        r.user_phone as "userPhone",
        r.answers,
        r.score,
        r.max_score as "maxScore",
        r.submitted_at as "submittedAt",
        r.metadata,
        f.title as "formTitle",
        f.is_quiz as "isQuiz",
        f.questions
      from form_responses r
      join forms f on f.id = r.form_id
      left join form_deployments d on d.id = r.deployment_id
      where ($1::text <> '' and r.user_id = $1)
         or ($2::text <> '' and lower(trim(r.user_email)) = $2)
      order by r.submitted_at desc
      `,
      [userId ?? '', email],
    );

    return res.rows.map((row) => ({
      id: row.id,
      formId: row.formId,
      sessionId: row.deploymentId,
      userId: row.userId,
      userName: row.userName,
      userEmail: row.userEmail,
      userPhone: row.userPhone,
      answers: row.answers,
      score: row.score,
      maxScore: row.maxScore,
      submittedAt: row.submittedAt,
      metadata: row.metadata,
      formTitle: row.formTitle,
      isQuiz: row.isQuiz,
      formObj: {
        id: row.formId,
        title: row.formTitle,
        isQuiz: row.isQuiz,
        questions: row.questions,
      },
    }));
  }

  private scoreQuiz(
    questions: QuestionDto[],
    answers: Record<string, unknown>,
  ): { score: number; maxScore: number } {
    let score = 0;
    let maxScore = 0;
    for (const q of questions) {
      maxScore += q.points ?? 0;
      const userAnswer = answers[q.id];
      if (q.type === 'CHECKBOX') {
        const correct = Array.isArray(q.correctAnswer) ? q.correctAnswer : [];
        const userArr = Array.isArray(userAnswer)
          ? userAnswer.map(String)
          : [];
        const isCorrect =
          correct.length === userArr.length &&
          correct.every((val) => userArr.includes(val));
        if (isCorrect) score += q.points ?? 0;
      } else if (
        userAnswer != null &&
        q.correctAnswer != null &&
        String(userAnswer).toLowerCase() === String(q.correctAnswer).toLowerCase()
      ) {
        score += q.points ?? 0;
      }
    }
    return { score, maxScore };
  }

  private async findFormRow(identifier: string): Promise<FormRow> {
    const res = await this.db.query<FormRow>(
      `
      select
        f.id::text as "internalId",
        coalesce(nullif(trim(f.public_id), ''), f.id::text) as id,
        f.title,
        f.description,
        f.is_quiz as "isQuiz",
        f.questions,
        f.success_message as "successMessage",
        f.active,
        f.created_by as "createdBy",
        f.created_at as "createdAt",
        f.updated_at as "updatedAt"
      from forms f
      where f.public_id = $1 or f.id::text = $1
      limit 1
      `,
      [identifier.trim()],
    );
    const row = res.rows[0];
    if (!row) throw new NotFoundException(`Form ${identifier} not found`);
    return row;
  }

  private async findDeploymentRow(
    identifier: string,
    formInternalId: string,
  ): Promise<DeploymentRow> {
    const res = await this.db.query<DeploymentRow>(
      `
      select
        d.id::text as "internalId",
        coalesce(nullif(trim(d.public_id), ''), d.id::text) as id,
        coalesce(nullif(trim(f.public_id), ''), f.id::text) as "formId",
        d.name,
        d.event_id as "eventId",
        d.created_at as "createdAt"
      from form_deployments d
      join forms f on f.id = d.form_id
      where (d.public_id = $1 or d.id::text = $1)
        and d.form_id = $2::uuid
      limit 1
      `,
      [identifier.trim(), formInternalId],
    );
    const row = res.rows[0];
    if (!row) {
      throw new NotFoundException(`Deployment ${identifier} not found`);
    }
    return row;
  }

  private async listDeploymentsForForm(
    formInternalId: string,
  ): Promise<
    Array<{
      id: string;
      formId: string;
      name: string;
      eventId?: string;
      createdAt: string;
    }>
  > {
    const res = await this.db.query<DeploymentRow>(
      `
      select
        d.id::text as "internalId",
        coalesce(nullif(trim(d.public_id), ''), d.id::text) as id,
        coalesce(nullif(trim(f.public_id), ''), f.id::text) as "formId",
        d.name,
        d.event_id as "eventId",
        d.created_at as "createdAt"
      from form_deployments d
      join forms f on f.id = d.form_id
      where d.form_id = $1::uuid
      order by d.created_at desc
      `,
      [formInternalId],
    );
    return res.rows.map((row) => this.toDeploymentContract(row, row.formId));
  }

  private async listResponsesForForm(
    formInternalId: string,
  ): Promise<ResponseRow[]> {
    const res = await this.db.query<ResponseRow>(
      `
      select
        coalesce(nullif(trim(r.public_id), ''), r.id::text) as id,
        coalesce(nullif(trim(f.public_id), ''), f.id::text) as "formId",
        coalesce(nullif(trim(d.public_id), ''), d.id::text) as "deploymentId",
        r.user_id as "userId",
        r.member_id as "memberId",
        r.user_name as "userName",
        r.user_email as "userEmail",
        r.user_phone as "userPhone",
        r.answers,
        r.score,
        r.max_score as "maxScore",
        r.submitted_at as "submittedAt",
        r.metadata
      from form_responses r
      join forms f on f.id = r.form_id
      left join form_deployments d on d.id = r.deployment_id
      where r.form_id = $1::uuid
      order by r.submitted_at desc
      `,
      [formInternalId],
    );
    return res.rows;
  }

  private async loadEventsMap(
    eventIds: string[],
  ): Promise<Record<string, { id: string; name: string; attendees: number }>> {
    if (eventIds.length === 0) return {};
    const res = await this.db.query<{
      id: string;
      name: string;
      attendees: number;
    }>(
      `
      select
        coalesce(nullif(trim(e.public_id), ''), e.id::text) as id,
        e.name,
        coalesce(e.attendees, 0)::int as attendees
      from events e
      where coalesce(nullif(trim(e.public_id), ''), e.id::text) = any($1::text[])
         or e.id::text = any($1::text[])
      `,
      [eventIds],
    );
    const map: Record<string, { id: string; name: string; attendees: number }> =
      {};
    for (const row of res.rows) {
      map[row.id] = row;
    }
    return map;
  }

  private toFormContract(row: FormRow) {
    return {
      id: row.id,
      title: row.title,
      description: row.description ?? undefined,
      isQuiz: row.isQuiz,
      questions: Array.isArray(row.questions) ? row.questions : [],
      successMessage: row.successMessage ?? undefined,
      active: row.active,
      createdBy: row.createdBy ?? '',
      createdAt: row.createdAt,
      sessions: [] as unknown[],
    };
  }

  private toDeploymentContract(row: DeploymentRow, formPublicId: string) {
    return {
      id: row.id,
      formId: formPublicId,
      name: row.name,
      eventId: row.eventId ?? undefined,
      createdAt: row.createdAt,
    };
  }

  private toResponseContract(row: ResponseRow) {
    const metadata =
      row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
        ? row.metadata
        : {};
    return {
      id: row.id,
      formId: row.formId,
      sessionId: row.deploymentId,
      deploymentId: row.deploymentId,
      deploymentName:
        typeof metadata.deploymentName === 'string' ? metadata.deploymentName : null,
      eventId: typeof metadata.eventId === 'string' ? metadata.eventId : null,
      userId: row.userId ?? row.memberId ?? 'guest',
      userName: row.userName,
      userEmail: row.userEmail,
      userPhone: row.userPhone,
      answers: row.answers ?? {},
      score: row.score,
      maxScore: row.maxScore,
      submittedAt: row.submittedAt,
      metadata,
    };
  }
}
