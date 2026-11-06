import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';

type User = {
  id: string;
  name: string;
  email: string;
  role: 'student' | 'teacher' | 'admin';
  blocked: boolean;
};
type FileInfo = { id: string; name: string; size: number };
type Course = {
  id: string;
  title: string;
  description: string;
  teacherId: string;
  teacher: { name: string };
  _count?: { assignments: number };
  assignments?: Assignment[];
};
type Assignment = {
  id: string;
  title: string;
  description: string;
  criteria: string;
  deadline: string;
  course: Course;
  attachment?: FileInfo;
  works: Work[];
};
type Work = {
  id: string;
  status: string;
  grade: number | null;
  comment: string | null;
  recommendations: string | null;
  studentComment: string;
  createdAt: string;
  reviewedAt: string | null;
  assignment: Assignment;
  student: User;
  file: FileInfo;
};
type Notice = {
  id: string;
  message: string;
  readAt: string | null;
  workId: string;
  createdAt: string;
  work: { assignment: { title: string } };
};
type Audit = {
  id: string;
  actor: { name: string };
  action: string;
  description: string;
  createdAt: string;
};
const labels: Record<string, string> = {
  empty: 'Не сдано',
  submitted: 'На проверке',
  reviewed: 'Проверено',
  rejected: 'Отклонено',
};
const roles = { student: 'Студент', teacher: 'Преподаватель', admin: 'Администратор' };
const date = (s: string | null) =>
  s
    ? new Date(s).toLocaleString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—';
const go = (route: string) => {
  location.hash = route;
};
async function api<T>(url: string, method = 'GET', data?: unknown): Promise<T> {
  const response = await fetch('/api' + url, {
    method,
    credentials: 'same-origin',
    headers: data === undefined ? {} : { 'Content-Type': 'application/json' },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
  const result = await response.json();
  if (!response.ok) {
    if (response.status === 401 && !['/auth/login', '/auth/register'].includes(url))
      window.dispatchEvent(new Event('session-expired'));
    throw new Error(result.error ?? 'Не удалось выполнить запрос');
  }
  return result as T;
}
async function upload(value: FormDataEntryValue | null): Promise<FileInfo> {
  if (!(value instanceof File) || !value.name || !value.size)
    throw new Error('Выберите непустой файл');
  const response = await fetch('/api/files', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/octet-stream',
      'X-File-Name': encodeURIComponent(value.name),
    },
    body: value,
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error);
  return result;
}
function useLoad<T>(url: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    api<T>(url)
      .then((v) => {
        if (active) setData(v);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [url]);
  return { data, error };
}
function Message({ error }: { error: string }) {
  return error ? (
    <div className="error" role="alert">
      {error}
    </div>
  ) : null;
}
function Loading({ error }: { error: string }) {
  return error ? (
    <Message error={error} />
  ) : (
    <p className="muted" role="status">
      Загрузка…
    </p>
  );
}
function Badge({ status }: { status: string }) {
  return <span className={`badge ${status}`}>{labels[status]}</span>;
}
function Field({
  label,
  name,
  value = '',
  type = 'text',
  required = true,
}: {
  label: string;
  name: string;
  value?: string;
  type?: string;
  required?: boolean;
}) {
  return (
    <label className="field">
      {label}
      <input
        name={name}
        type={type}
        defaultValue={value}
        required={required}
        autoComplete={type === 'password' ? 'current-password' : undefined}
      />
    </label>
  );
}
function Area({
  label,
  name,
  value = '',
  required = true,
}: {
  label: string;
  name: string;
  value?: string;
  required?: boolean;
}) {
  return (
    <label className="field">
      {label}
      <textarea name={name} defaultValue={value} rows={3} required={required} />
    </label>
  );
}
function FileField({
  label = 'Файл работы',
  required = true,
}: {
  label?: string;
  required?: boolean;
}) {
  return (
    <label className="field upload-field">
      {label}
      <input
        aria-label={label}
        name="file"
        type="file"
        accept=".pdf,.docx,.txt,.zip"
        required={required}
      />
      <small>PDF, DOCX, TXT или ZIP · до 5 МБ</small>
    </label>
  );
}
function Form({
  title,
  button,
  children,
  submit,
}: {
  title: string;
  button: string;
  children: ReactNode;
  submit: (data: FormData) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setError('');
    setBusy(true);
    try {
      await submit(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка запроса');
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="panel form-panel" aria-label={title} onSubmit={send} noValidate>
      <h2>{title}</h2>
      <fieldset disabled={busy}>
        {children}
        <Message error={error} />
        <button className="primary" type="submit">
          {busy ? 'Сохранение…' : button}
        </button>
      </fieldset>
    </form>
  );
}
function FileLink({ file }: { file?: FileInfo | null }) {
  return file ? (
    <a className="file-card" href={`/api/files/${file.id}`} download>
      <span className="file-mark">{file.name.split('.').at(-1)?.toUpperCase()}</span>
      <span>
        <strong>{file.name}</strong>
        <small>{Math.ceil(file.size / 1024)} КБ · скачать файл</small>
      </span>
      <span aria-hidden="true">↓</span>
    </a>
  ) : null;
}
function Heading({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children?: ReactNode;
}) {
  return (
    <header className="page-heading">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
      </div>
      {children}
    </header>
  );
}
type Common = { user: User; changed: (message: string) => void };
function Auth({ onLogin }: { onLogin: (u: User) => void }) {
  const [register, setRegister] = useState(false);
  return (
    <main className="auth-shell">
      <section className="auth-story">
        <a className="brand" href="#">
          <span className="brand-mark">Р</span>Рецензия<span className="brand-dot">.</span>
        </a>
        <div className="eyebrow">Учебное пространство</div>
        <h1>
          От первой попытки
          <br />к ясному результату.
        </h1>
        <p>Задания, работы и обратная связь преподавателя — в одном месте.</p>
        <div className="auth-steps">
          <span>01 · Выберите задание</span>
          <span>02 · Отправьте работу</span>
          <span>03 · Получите рецензию</span>
        </div>
      </section>
      <section className="auth-form">
        <Form
          key={String(register)}
          title={register ? 'Регистрация студента' : 'Вход в систему'}
          button={register ? 'Зарегистрироваться' : 'Войти'}
          submit={async (f) => {
            const user = await api<User>(
              register ? '/auth/register' : '/auth/login',
              'POST',
              Object.fromEntries(f),
            );
            onLogin(user);
            go(user.role === 'admin' ? '/users' : '/courses');
          }}
        >
          {register && <Field label="Имя и фамилия" name="name" />}
          <Field label="Email" name="email" type="email" />
          <Field label="Пароль" name="password" type="password" />
          <small>Пароль: от 8 до 128 символов.</small>
        </Form>
        <button className="text-button" onClick={() => setRegister(!register)}>
          {register ? 'Уже есть аккаунт? Войти' : 'Нет аккаунта? Зарегистрироваться'}
        </button>
        <details className="demo-help">
          <summary>Учётные записи для демонстрации</summary>
          <p>
            student@study.local
            <br />
            teacher@study.local
            <br />
            admin@study.local
          </p>
          <p>Пароль: Study2026!</p>
        </details>
      </section>
    </main>
  );
}
function Courses({ user, changed }: Common) {
  const [q, setQ] = useState('');
  const [create, setCreate] = useState(false);
  const { data, error } = useLoad<Course[]>('/courses?q=' + encodeURIComponent(q));
  return (
    <>
      <Heading eyebrow="Рабочее пространство" title="Мои курсы">
        {user.role === 'teacher' && (
          <button className="primary" onClick={() => setCreate(!create)}>
            Добавить курс
          </button>
        )}
      </Heading>
      <p className="lead">Выберите курс, чтобы открыть задания и продолжить работу.</p>
      <label className="search">
        Поиск курсов
        <input
          type="search"
          placeholder="Название курса"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </label>
      {create && (
        <Form
          title="Новый курс"
          button="Создать курс"
          submit={async (f) => {
            const c = await api<Course>('/courses', 'POST', Object.fromEntries(f));
            changed('Курс создан');
            go('/course/' + c.id);
          }}
        >
          <Field label="Название курса" name="title" />
          <Area label="Описание курса" name="description" />
        </Form>
      )}
      {!data ? (
        <Loading error={error} />
      ) : data.length ? (
        <div className="course-grid">
          {data.map((c) => (
            <a className="panel course-card" key={c.id} href={'#/course/' + c.id}>
              <div className="eyebrow">{c.teacherId === user.id ? 'Ваш курс' : 'Учебный курс'}</div>
              <h2>{c.title}</h2>
              <p>{c.description}</p>
              <div className="card-footer">
                <span>{c.teacher.name}</span>
                <span>{c._count?.assignments ?? 0} заданий →</span>
              </div>
            </a>
          ))}
        </div>
      ) : (
        <div className="empty">Курсы не найдены. Измените поисковый запрос.</div>
      )}
    </>
  );
}
function CoursePage({ id, user, changed }: Common & { id: string }) {
  const [status, setStatus] = useState('all');
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');
  const { data: course, error: loadError } = useLoad<Course>(`/courses/${id}?status=${status}`);
  if (!course) return <Loading error={loadError} />;
  const owner = user.role === 'teacher' && course.teacherId === user.id;
  return (
    <>
      <a className="back" href="#/courses">
        ← Все курсы
      </a>
      <Heading eyebrow={course.teacher.name} title={course.title} />
      <p className="lead">{course.description}</p>
      {owner && (
        <div className="toolbar">
          <button className="primary" onClick={() => setAdding(!adding)}>
            Добавить задание
          </button>
          <button className="secondary" onClick={() => setEditing(!editing)}>
            Изменить курс
          </button>
          <button
            className="text-button danger"
            onClick={async () => {
              if (!confirm('Удалить курс, его задания и работы?')) return;
              try {
                await api(`/courses/${id}`, 'DELETE');
                changed('Курс удалён');
                go('/courses');
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            Удалить курс
          </button>
        </div>
      )}
      <Message error={error} />
      {editing && (
        <Form
          title="Редактирование курса"
          button="Сохранить курс"
          submit={async (f) => {
            await api(`/courses/${id}`, 'PATCH', Object.fromEntries(f));
            changed('Изменения курса сохранены');
          }}
        >
          <Field label="Название курса" name="title" value={course.title} />
          <Area label="Описание курса" name="description" value={course.description} />
        </Form>
      )}
      {adding && (
        <Form
          title="Новое задание"
          button="Создать задание"
          submit={async (f) => {
            const file = f.get('file');
            const attachment = file instanceof File && file.name ? await upload(file) : null;
            await api(`/courses/${id}/assignments`, 'POST', {
              title: f.get('title'),
              description: f.get('description'),
              criteria: f.get('criteria'),
              deadline: f.get('deadline') ? new Date(String(f.get('deadline'))).toISOString() : '',
              attachmentId: attachment?.id,
            });
            changed('Задание создано');
          }}
        >
          <Field label="Название задания" name="title" />
          <Area label="Условие задания" name="description" />
          <Area label="Критерии оценки" name="criteria" required={false} />
          <Field label="Срок сдачи" name="deadline" type="datetime-local" />
          <FileField label="Материалы задания" required={false} />
        </Form>
      )}
      <div className="section-top">
        <h2>Задания курса</h2>
        {user.role === 'student' && (
          <label className="filter">
            Статус
            <select aria-label="Статус" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="all">Все задания</option>
              {Object.entries(labels).map(([key, value]) => (
                <option value={key} key={key}>
                  {value}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <div className="assignment-list">
        {course.assignments?.length ? (
          course.assignments.map((a, i) => (
            <a className="panel assignment-row" key={a.id} href={'#/assignment/' + a.id}>
              <span className="step-number">{String(i + 1).padStart(2, '0')}</span>
              <div>
                <h2>{a.title}</h2>
                <p>{a.description}</p>
                <small>До {date(a.deadline)}</small>
              </div>
              {user.role === 'student' && <Badge status={a.works[0]?.status ?? 'empty'} />}
              <span aria-hidden="true">→</span>
            </a>
          ))
        ) : (
          <div className="empty">Заданий с таким статусом нет.</div>
        )}
      </div>
    </>
  );
}
function AssignmentPage({ id, user, changed }: Common & { id: string }) {
  const { data: a, error } = useLoad<Assignment>('/assignments/' + id);
  if (!a) return <Loading error={error} />;
  const work = a.works[0];
  const late = new Date(a.deadline) < new Date();
  return (
    <>
      <a className="back" href={'#/course/' + a.course.id}>
        ← {a.course.title}
      </a>
      <Heading eyebrow="Учебное задание" title={a.title}>
        <Badge status={work?.status ?? 'empty'} />
      </Heading>
      <div className="detail-grid">
        <section className="panel">
          <h2>Условие</h2>
          <p className="prewrap">{a.description}</p>
          <h3>Критерии оценки</h3>
          <p className="prewrap">{a.criteria || 'Указаны в условии задания.'}</p>
          <FileLink file={a.attachment} />
          <div className="meta rule-top">
            Срок сдачи: {date(a.deadline)}
            <br />
            Преподаватель: {a.course.teacher.name}
          </div>
        </section>
        <div>
          {user.role === 'student' ? (
            work ? (
              <section className="panel">
                <h2>Работа отправлена</h2>
                <p>
                  Отправлено {date(work.createdAt)}. Результат и файл доступны на странице работы.
                </p>
                <a className="primary button-link" href={'#/work/' + work.id}>
                  Открыть работу
                </a>
              </section>
            ) : late ? (
              <div className="panel">
                <h2>Приём работ завершён</h2>
                <p>Срок сдачи этого задания истёк.</p>
              </div>
            ) : (
              <Form
                title="Отправить работу"
                button="Отправить на проверку"
                submit={async (f) => {
                  const file = await upload(f.get('file'));
                  const result = await api<Work>(`/assignments/${id}/submit`, 'POST', {
                    fileId: file.id,
                    comment: f.get('comment'),
                  });
                  changed('Работа отправлена на проверку');
                  go('/work/' + result.id);
                }}
              >
                <FileField />
                <Area label="Комментарий к работе" name="comment" required={false} />
              </Form>
            )
          ) : (
            <div className="panel">
              <h2>Проверка работ</h2>
              <p>Отправленные работы отображаются в очереди преподавателя.</p>
              <a className="secondary button-link" href="#/queue">
                Открыть очередь
              </a>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
function Queue() {
  const { data, error } = useLoad<Work[]>('/works');
  return (
    <>
      <Heading eyebrow="Преподавателю" title="Очередь проверки" />
      <p className="lead">Работы по вашим курсам, ожидающие рецензии.</p>
      {!data ? (
        <Loading error={error} />
      ) : data.length ? (
        <div className="assignment-list">
          {data.map((w) => (
            <a className="panel assignment-row" key={w.id} href={'#/work/' + w.id}>
              <div>
                <h2>{w.assignment.title}</h2>
                <p>
                  {w.student.name} · {w.assignment.course.title}
                </p>
                <small>Отправлено {date(w.createdAt)}</small>
              </div>
              <Badge status={w.status} />
              <span aria-hidden="true">→</span>
            </a>
          ))}
        </div>
      ) : (
        <div className="empty">Все работы проверены. Очередь пуста.</div>
      )}
    </>
  );
}
function WorkPage({ id, user, changed }: Common & { id: string }) {
  const { data: w, error } = useLoad<Work>('/works/' + id);
  if (!w) return <Loading error={error} />;
  return (
    <>
      <a className="back" href={user.role === 'teacher' ? '#/queue' : '#/history'}>
        ← {user.role === 'teacher' ? 'К списку работ' : 'История работ'}
      </a>
      <Heading
        eyebrow={w.assignment?.course.title ?? 'Учебная работа'}
        title={w.assignment?.title ?? 'Работа'}
      >
        <Badge status={w.status} />
      </Heading>
      <div className="detail-grid">
        <section className="panel">
          <h2>Работа студента</h2>
          <p>
            <strong>{w.student.name}</strong>
            <br />
            <span className="muted">Отправлено {date(w.createdAt)}</span>
          </p>
          <FileLink file={w.file} />
          {w.studentComment && (
            <>
              <h3>Комментарий студента</h3>
              <p className="prewrap">{w.studentComment}</p>
            </>
          )}
          <h3>Критерии оценки</h3>
          <p className="prewrap">{w.assignment?.criteria || 'Указаны в задании.'}</p>
        </section>
        <div>
          {w.status !== 'submitted' ? (
            <section className="panel result-panel">
              <h2>Результат проверки</h2>
              {w.status === 'reviewed' && (
                <div className="grade">
                  {w.grade}
                  <span> / 100</span>
                </div>
              )}
              <h3>
                {w.status === 'reviewed' ? 'Комментарий преподавателя' : 'Причина отклонения'}
              </h3>
              <p className="prewrap">{w.comment}</p>
              {w.recommendations && (
                <>
                  <h3>Рекомендации</h3>
                  <p className="prewrap">{w.recommendations}</p>
                </>
              )}
              <div className="meta rule-top">Проверено {date(w.reviewedAt)}</div>
            </section>
          ) : user.role === 'teacher' ? (
            <>
              <Form
                title="Рецензия"
                button="Сохранить рецензию"
                submit={async (f) => {
                  const grade = f.get('grade');
                  await api(`/works/${id}/review`, 'POST', {
                    grade: grade === '' ? null : Number(grade),
                    comment: f.get('comment'),
                    recommendations: f.get('recommendations'),
                  });
                  changed('Рецензия сохранена. Студент получил уведомление');
                }}
              >
                <Field label="Оценка от 0 до 100" name="grade" type="number" />
                <Area label="Комментарий преподавателя" name="comment" />
                <Area label="Рекомендации" name="recommendations" />
              </Form>
              <details className="reject-section">
                <summary>Отклонить работу без оценки</summary>
                <Form
                  title="Отклонение работы"
                  button="Отклонить работу"
                  submit={async (f) => {
                    await api(`/works/${id}/reject`, 'POST', { reason: f.get('reason') });
                    changed('Работа отклонена. Причина отправлена студенту');
                  }}
                >
                  <Area label="Причина отклонения" name="reason" />
                </Form>
              </details>
            </>
          ) : (
            <section className="panel">
              <h2>Работа на проверке</h2>
              <p>
                После проверки здесь появится рецензия. В разделе уведомлений появится новое
                сообщение.
              </p>
            </section>
          )}
        </div>
      </div>
    </>
  );
}
function History() {
  const { data, error } = useLoad<Work[]>('/history');
  return (
    <>
      <Heading eyebrow="Студенту" title="История работ" />
      <p className="lead">Отправленные файлы, оценки и комментарии преподавателя.</p>
      {!data ? (
        <Loading error={error} />
      ) : data.length ? (
        <div className="table-wrap panel">
          <table>
            <thead>
              <tr>
                <th>Задание / курс</th>
                <th>Отправлено</th>
                <th>Статус</th>
                <th>Оценка</th>
                <th>Рецензия</th>
              </tr>
            </thead>
            <tbody>
              {data.map((w) => (
                <tr key={w.id}>
                  <td>
                    <a className="table-link" href={'#/work/' + w.id}>
                      {w.assignment?.title ?? 'Работа'}
                    </a>
                    <small>{w.assignment?.course.title}</small>
                  </td>
                  <td>{date(w.createdAt)}</td>
                  <td>
                    <Badge status={w.status} />
                  </td>
                  <td>{w.grade ?? '—'}</td>
                  <td>
                    {w.comment || 'Ожидается проверка'}
                    {w.recommendations && <small>Рекомендации: {w.recommendations}</small>}
                    <small>{date(w.reviewedAt)}</small>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty">Вы ещё не отправляли работы.</div>
      )}
    </>
  );
}
function Notifications({ changed }: Common) {
  const { data, error } = useLoad<Notice[]>('/notifications');
  const [actionError, setActionError] = useState('');
  return (
    <>
      <Heading eyebrow="Обратная связь" title="Уведомления" />
      <Message error={actionError} />
      {!data ? (
        <Loading error={error} />
      ) : data.length ? (
        data.map((n) => (
          <section className={`panel notice ${n.readAt ? '' : 'unread'}`} key={n.id}>
            <div>
              <span className="eyebrow">{n.readAt ? 'Прочитано' : 'Новое'}</span>
              <h2>{n.message}</h2>
              <p>{n.work.assignment?.title}</p>
              <small>{date(n.createdAt)}</small>
            </div>
            <button
              className="secondary"
              onClick={async () => {
                try {
                  await api(`/notifications/${n.id}/read`, 'PATCH');
                  changed('Уведомление прочитано');
                  go('/work/' + n.workId);
                } catch (e) {
                  setActionError((e as Error).message);
                }
              }}
            >
              Открыть результат
            </button>
          </section>
        ))
      ) : (
        <div className="empty">Новых событий пока нет. Здесь появятся результаты проверки.</div>
      )}
    </>
  );
}
function Users({ user, changed }: Common) {
  const { data, error } = useLoad<User[]>('/users');
  const [selected, setSelected] = useState<User | null>(null);
  return (
    <>
      <Heading eyebrow="Администрирование" title="Пользователи" />
      <p className="lead">
        Назначайте роли и управляйте доступом. Изменение завершает активные сеансы пользователя.
      </p>
      {selected && (
        <Form
          title={`Доступ: ${selected.name}`}
          button="Сохранить доступ"
          submit={async (f) => {
            await api(`/users/${selected.id}`, 'PATCH', {
              role: f.get('role'),
              blocked: f.get('blocked') === 'on',
            });
            changed('Права пользователя обновлены');
          }}
        >
          <label className="field">
            Роль
            <select aria-label="Роль" name="role" defaultValue={selected.role}>
              {Object.entries(roles).map(([k, v]) => (
                <option value={k} key={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label className="checkbox">
            <input type="checkbox" name="blocked" defaultChecked={selected.blocked} />
            Заблокировать вход
          </label>
        </Form>
      )}
      {!data ? (
        <Loading error={error} />
      ) : (
        <div className="panel table-wrap">
          <table>
            <thead>
              <tr>
                <th>Пользователь</th>
                <th>Email</th>
                <th>Роль</th>
                <th>Доступ</th>
                <th>Действие</th>
              </tr>
            </thead>
            <tbody>
              {data.map((u) => (
                <tr key={u.id}>
                  <td>{u.name}</td>
                  <td>{u.email}</td>
                  <td>{roles[u.role]}</td>
                  <td>{u.blocked ? 'Заблокирован' : 'Активен'}</td>
                  <td>
                    {u.id !== user.id ? (
                      <button className="secondary" onClick={() => setSelected(u)}>
                        Изменить
                      </button>
                    ) : (
                      <small>Ваша запись</small>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
function AuditPage() {
  const { data, error } = useLoad<Audit[]>('/audit');
  return (
    <>
      <Heading eyebrow="Администрирование" title="Журнал действий" />
      <p className="lead">
        Последние 200 событий: изменения курсов, отправка и проверка работ, управление доступом.
      </p>
      {!data ? (
        <Loading error={error} />
      ) : (
        <div className="panel table-wrap">
          <table>
            <thead>
              <tr>
                <th>Дата</th>
                <th>Пользователь</th>
                <th>Действие</th>
                <th>Описание</th>
              </tr>
            </thead>
            <tbody>
              {data.map((a) => (
                <tr key={a.id}>
                  <td>{date(a.createdAt)}</td>
                  <td>{a.actor.name}</td>
                  <td>
                    <code>{a.action}</code>
                  </td>
                  <td>{a.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
function App() {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [route, setRoute] = useState(location.hash.slice(1) || '/courses');
  const [version, setVersion] = useState(0);
  const [message, setMessage] = useState('');
  const [unread, setUnread] = useState(0);
  useEffect(() => {
    const expired = () => setUser(null);
    window.addEventListener('session-expired', expired);
    api<User>('/auth/me')
      .then(setUser)
      .catch(() => undefined)
      .finally(() => setReady(true));
    const change = () => {
      setRoute(location.hash.slice(1) || '/courses');
    };
    window.addEventListener('hashchange', change);
    return () => {
      window.removeEventListener('hashchange', change);
      window.removeEventListener('session-expired', expired);
    };
  }, []);
  useEffect(() => {
    if (user?.role !== 'student') return;
    const refresh = () =>
      api<Notice[]>('/notifications')
        .then((n) => setUnread(n.filter((x) => !x.readAt).length))
        .catch(() => undefined);
    void refresh();
    const timer = setInterval(refresh, 10000);
    return () => clearInterval(timer);
  }, [user, version, route]);
  if (!ready)
    return (
      <main className="boot">
        <Loading error="" />
      </main>
    );
  if (!user)
    return (
      <Auth
        onLogin={(u) => {
          setUser(u);
          setMessage('');
        }}
      />
    );
  const changed = (s: string) => {
    setMessage(s);
    setVersion((v) => v + 1);
  };
  const common = { user, changed };
  const [view, id = ''] = route.slice(1).split('/');
  const nav = [
    ['courses', 'Курсы'],
    ...(user.role === 'student'
      ? [
          ['history', 'История работ'],
          ['notifications', 'Уведомления'],
        ]
      : []),
    ...(user.role === 'teacher' ? [['queue', 'На проверке']] : []),
    ...(user.role === 'admin'
      ? [
          ['users', 'Пользователи'],
          ['audit', 'Журнал действий'],
        ]
      : []),
  ];
  const pages: Record<string, ReactNode> = {
    courses: <Courses {...common} />,
    course: <CoursePage {...common} id={id} />,
    assignment: <AssignmentPage {...common} id={id} />,
    work: <WorkPage {...common} id={id} />,
    queue: <Queue />,
    history: <History />,
    notifications: <Notifications {...common} />,
    users: <Users {...common} />,
    audit: <AuditPage />,
  };
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#/courses">
          <span className="brand-mark">Р</span>Рецензия<span className="brand-dot">.</span>
        </a>
        <div className="workspace-label">Учебное пространство</div>
        <nav aria-label="Основная навигация">
          {nav.map(([key, title]) => (
            <a className={'nav-item ' + (view === key ? 'active' : '')} key={key} href={'#/' + key}>
              {title}
              {key === 'notifications' && unread > 0 && (
                <span className="counter" aria-label="Непрочитанные уведомления">
                  {unread}
                </span>
              )}
            </a>
          ))}
        </nav>
        <div className="account">
          <strong>{user.name}</strong>
          <small>{roles[user.role]}</small>
          <button
            className="text-button"
            onClick={async () => {
              try {
                await api('/auth/logout', 'POST');
              } finally {
                setUser(null);
              }
            }}
          >
            Выйти
          </button>
        </div>
        <small className="version">Релиз 1.0 · КПО</small>
      </aside>
      <main className="main">
        <div className="topline">
          <span>Проверка учебных работ</span>
          <span>{roles[user.role]}</span>
        </div>
        {message && (
          <div className="success" role="status">
            {message}
            <button aria-label="Закрыть сообщение" onClick={() => setMessage('')}>
              ×
            </button>
          </div>
        )}
        <div key={route + version}>
          {pages[view ?? 'courses'] ?? (
            <div className="empty">
              Страница не найдена. <a href="#/courses">Открыть курсы</a>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
createRoot(document.getElementById('root')!).render(<App />);
