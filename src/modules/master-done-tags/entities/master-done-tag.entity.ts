export class MasterDoneTag {
  id: string;
  code: string;
  label: string;
  category: 'CORE' | 'ELECTIVE' | 'SPECIAL';
  description?: string | null;
  createdAt: Date;
}
