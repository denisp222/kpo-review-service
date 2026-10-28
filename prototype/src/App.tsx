import { useState, useSyncExternalStore, type FormEvent } from 'react';
import { createRoot } from 'react-dom/client';
import {
  PrototypeStore,
  assignments,
  student,
  teacher,
  type DemoWork,
  type FileInfo,
  type StorageLike,
} from './store.js';

let storage: StorageLike | undefined;
try {
  storage = window.localStorage;
} catch {
  /* The prototype still works for the current session. */
}
const store = new PrototypeStore(storage);
type Status = DemoWork['status'] | 'empty';
const labels: Record<Status, string> = {
  empty: 'Не сдано',
  submitted: 'На проверке',
  reviewed: 'Проверено',
  rejected: 'Отклонено',
};
const date = (value: string) =>
  new Date(value).toLocaleString('ru-RU', {
    day: '2-digit',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  });
const size = (value: number) => (value < 1024 ? `${value} Б` : `${Math.ceil(value / 1024)} КБ`);

function Arrow() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M5 12h14m-6-6 6 6-6 6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function Badge({ status }: { status: Status }) {
  return <span className={`badge ${status}`}>{labels[status]}</span>;
}
function FileCard({ file }: { file: FileInfo }) {
  return (
    <div className="file-card">
      <span className="file-mark">{file.name.split('.').at(-1)?.toUpperCase()}</span>
      <div>
        <strong>{file.name}</strong>
        <small>{size(file.size)} · сведения о выбранном файле</small>
      </div>
    </div>
  );
}
function Result({ work }: { work: DemoWork }) {
  return (
    <section className="panel result-panel">
      <div className="section-top">
        <h2>Результат проверки</h2>
        <Badge status={work.status} />
      </div>
      {work.status === 'reviewed' ? (
        <>
          <div className="grade">
            {work.grade}
            <span> / 100</span>
          </div>
          <h3>Комментарий преподавателя</h3>
          <p>{work.comment}</p>
          <h3>Рекомендации</h3>
          <p>{work.recommendations}</p>
        </>
      ) : (
        <>
          <h3>Причина отклонения</h3>
          <p>{work.comment}</p>
          <p className="muted small">
            Порядок повторной сдачи после отклонения ещё нужно согласовать с преподавателем.
          </p>
        </>
      )}
      {work.reviewedAt && <div className="meta rule-top">Проверено {date(work.reviewedAt)}</div>}
    </section>
  );
}
function SubmitForm({ assignmentId, onDone }: { assignmentId: string; onDone: () => void }) {
  const [file, setFile] = useState<FileInfo | null>(null);
  const [comment, setComment] = useState('');
  const [error, setError] = useState('');
  function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    try {
      store.submit(assignmentId, student, file, comment);
      onDone();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Не удалось отправить работу');
    }
  }
  return (
    <form className="panel" onSubmit={submit} noValidate>
      <div className="section-top">
        <h2>Отправить работу</h2>
        <span className="step-number">01</span>
      </div>
      <label className="upload" htmlFor="work-file">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M12 16V4m-5 5 5-5 5 5M4 15v5h16v-5"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <strong>{file ? file.name : 'Выбрать файл работы'}</strong>
        <span>{file ? size(file.size) : 'PDF, DOCX, TXT или ZIP · до 5 МБ'}</span>
      </label>
      <input
        className="sr-only"
        id="work-file"
        type="file"
        accept=".pdf,.docx,.txt,.zip"
        aria-label="Файл работы"
        onChange={(event) => {
          const value = event.target.files?.[0];
          setFile(value ? { name: value.name, size: value.size } : null);
          setError('');
        }}
      />
      <p className="small muted">
        В прототипе сохраняются только имя и размер файла. Содержимое на сервер не отправляется.
      </p>
      <label className="field" htmlFor="submission-comment">
        Комментарий к работе <span className="optional">необязательно</span>
        <textarea
          id="submission-comment"
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          maxLength={2000}
          placeholder="Что стоит учесть при проверке?"
        />
      </label>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <button className="button primary full" type="submit">
        Отправить на проверку <Arrow />
      </button>
    </form>
  );
}
function ReviewForm({ work, onDone }: { work: DemoWork; onDone: (text: string) => void }) {
  const [grade, setGrade] = useState('');
  const [comment, setComment] = useState('');
  const [recommendations, setRecommendations] = useState('');
  const [reason, setReason] = useState('');
  const [mode, setMode] = useState<'review' | 'reject'>('review');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (mode === 'review') {
        await store.reviews.review(work.id, teacher, {
          grade: grade.trim() ? Number(grade) : Number.NaN,
          comment,
          recommendations,
        });
        onDone('Рецензия сохранена. Студенту добавлено уведомление.');
      } else {
        await store.reviews.reject(work.id, teacher, { reason });
        onDone('Работа отклонена. Студент увидит причину в результате проверки.');
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Не удалось сохранить решение');
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="panel" onSubmit={(event) => void submit(event)} noValidate>
      <h2>Проверка работы</h2>
      <div className="segmented" aria-label="Решение по работе">
        <button
          type="button"
          aria-pressed={mode === 'review'}
          className={mode === 'review' ? 'selected' : ''}
          onClick={() => {
            setMode('review');
            setError('');
          }}
        >
          Поставить оценку
        </button>
        <button
          type="button"
          aria-pressed={mode === 'reject'}
          className={mode === 'reject' ? 'selected' : ''}
          onClick={() => {
            setMode('reject');
            setError('');
          }}
        >
          Отклонить
        </button>
      </div>
      {mode === 'review' ? (
        <>
          <label className="field" htmlFor="grade">
            Оценка
            <div className="grade-input">
              <input
                id="grade"
                type="number"
                min="0"
                max="100"
                step="1"
                value={grade}
                onChange={(event) => setGrade(event.target.value)}
                placeholder="0"
              />
              <span>из 100</span>
            </div>
          </label>
          <label className="field" htmlFor="review-comment">
            Комментарий
            <textarea
              id="review-comment"
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              maxLength={2000}
              placeholder="Что выполнено верно, что требует внимания?"
            />
          </label>
          <label className="field" htmlFor="recommendations">
            Рекомендации
            <textarea
              id="recommendations"
              value={recommendations}
              onChange={(event) => setRecommendations(event.target.value)}
              maxLength={2000}
              placeholder="Что стоит улучшить в работе?"
            />
          </label>
        </>
      ) : (
        <label className="field" htmlFor="reason">
          Причина отклонения
          <textarea
            id="reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            maxLength={2000}
            placeholder="Объясните студенту, почему работа отклонена"
          />
        </label>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <button className="button primary full" type="submit" disabled={busy}>
        {busy ? 'Сохранение…' : mode === 'review' ? 'Сохранить рецензию' : 'Отклонить работу'}
        <Arrow />
      </button>
      <p className="small muted">После сохранения студент увидит результат и уведомление.</p>
    </form>
  );
}

function App() {
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const [role, setRole] = useState<'student' | 'teacher'>('student');
  const [tab, setTab] = useState<'main' | 'notifications'>('main');
  const [selected, setSelected] = useState<string | null>(null);
  const [filter, setFilter] = useState<Status | 'all'>('all');
  const [notice, setNotice] = useState('');
  const unread = state.notifications.filter((item) => !item.read).length;
  const assignment = assignments.find((item) => item.id === selected);
  const work = selected ? store.workForAssignment(selected) : undefined;
  const pending = state.works.filter(
    (item) => item.status === 'submitted' && item.teacherId === teacher.id,
  );
  function home() {
    setSelected(null);
    setTab('main');
    setNotice('');
  }
  function switchRole(value: 'student' | 'teacher') {
    setRole(value);
    setFilter('all');
    home();
  }
  function open(id: string) {
    setSelected(id);
    setTab('main');
    setNotice('');
  }
  function reset() {
    if (!window.confirm('Сбросить учебные данные и начать демонстрацию заново?')) return;
    try {
      store.reset();
      setFilter('all');
      home();
      setNotice('Учебные данные восстановлены.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Не удалось сбросить данные');
    }
  }
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a
          className="brand"
          href="#"
          onClick={(event) => {
            event.preventDefault();
            home();
          }}
        >
          <span className="brand-mark">Р</span>Рецензия<span className="brand-dot">.</span>
        </a>
        <div className="workspace-label">Учебное пространство</div>
        <div className="course-label">
          Конструирование ПО<small>ПИбд-42 · осень 2026</small>
        </div>
        <nav aria-label="Основная навигация">
          <button className={tab === 'main' ? 'nav-item active' : 'nav-item'} onClick={home}>
            <span>{role === 'student' ? 'Мои задания' : 'Работы на проверку'}</span>
            <span className="nav-count">
              {role === 'student' ? assignments.length : pending.length}
            </span>
          </button>
          {role === 'student' && (
            <button
              className={tab === 'notifications' ? 'nav-item active' : 'nav-item'}
              onClick={() => {
                setTab('notifications');
                setSelected(null);
                setNotice('');
              }}
            >
              <span>Уведомления</span>
              {unread > 0 && <span className="unread-count">{unread}</span>}
            </button>
          )}
        </nav>
        <div className="sidebar-bottom">
          <span className="meta">Лабораторная работа №6</span>
          <p>Прототип основного сценария рецензирования.</p>
          <button className="text-button" onClick={reset}>
            Начать демонстрацию заново
          </button>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <span className="prototype-label">
            <span />
            Интерактивный прототип
          </span>
          <label className="role-label">
            Режим просмотра
            <select
              aria-label="Роль"
              value={role}
              onChange={(event) => switchRole(event.target.value as 'student' | 'teacher')}
            >
              <option value="student">Студент</option>
              <option value="teacher">Преподаватель</option>
            </select>
          </label>
        </header>
        <main>
          <div className="scope-note">
            Учебные данные в одном браузере. Переключение роли используется для показа сценария.
            {!storage && ' Сохранение после закрытия браузера недоступно.'}
          </div>
          {notice && (
            <div className="notice" role="status">
              {notice}
            </div>
          )}
          {tab === 'notifications' ? (
            <>
              <div className="page-heading">
                <span className="eyebrow">Обратная связь</span>
                <h1>Уведомления</h1>
                <p>Результаты проверки ваших работ.</p>
              </div>
              {state.notifications.length === 0 ? (
                <div className="empty-state">
                  <span className="empty-symbol">—</span>
                  <h2>Пока нет уведомлений</h2>
                  <p>Они появятся, когда преподаватель проверит или отклонит работу.</p>
                  <button className="button" onClick={home}>
                    Перейти к заданиям
                  </button>
                </div>
              ) : (
                <div className="notification-list">
                  {state.notifications.map((item) => (
                    <button
                      className={`notification-row ${item.read ? '' : 'new'}`}
                      key={item.id}
                      onClick={() => {
                        try {
                          store.markRead(item.id);
                          const found = state.works.find((work) => work.id === item.workId);
                          if (found) open(found.assignmentId);
                        } catch (error) {
                          setNotice(error instanceof Error ? error.message : 'Ошибка сохранения');
                        }
                      }}
                    >
                      <span className="notification-dot" />
                      <div>
                        <strong>{item.message}</strong>
                        <small>
                          {date(item.createdAt)} · {item.read ? 'Прочитано' : 'Новое'}
                        </small>
                      </div>
                      <Arrow />
                    </button>
                  ))}
                </div>
              )}
            </>
          ) : assignment ? (
            <>
              <button className="back-button" onClick={home}>
                ← {role === 'student' ? 'К списку заданий' : 'К списку работ'}
              </button>
              <div className="page-heading detail-heading">
                <span className="eyebrow">
                  Задание {assignment.number} · до {assignment.due}
                </span>
                <h1>{assignment.title}</h1>
                <Badge status={work?.status ?? 'empty'} />
              </div>
              <div className="detail-grid">
                <div>
                  <section className="panel">
                    <h2>Условие задания</h2>
                    <p>{assignment.description}</p>
                    <h3>Критерии проверки</h3>
                    <ul className="criteria">
                      {assignment.criteria.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </section>
                  {work && (
                    <section className="panel">
                      <div className="section-top">
                        <h2>{role === 'teacher' ? 'Работа студента' : 'Ваша работа'}</h2>
                        <span className="meta">ПИбд-42</span>
                      </div>
                      <FileCard file={work.file} />
                      {work.submissionComment && <p>{work.submissionComment}</p>}
                      <div className="meta">Отправлено {date(work.submittedAt)}</div>
                      <p className="small muted">
                        В этой версии показаны сведения о файле. Серверное хранение и скачивание ещё
                        не подключены.
                      </p>
                    </section>
                  )}
                </div>
                <div>
                  {work && work.status !== 'submitted' ? (
                    <Result work={work} />
                  ) : role === 'teacher' && work ? (
                    <ReviewForm key={work.id} work={work} onDone={setNotice} />
                  ) : work ? (
                    <section className="panel waiting-panel">
                      <span className="waiting-mark">✓</span>
                      <h2>Работа отправлена</h2>
                      <p>
                        Она появилась в списке преподавателя. Результат будет доступен здесь после
                        проверки.
                      </p>
                      <button className="button" onClick={() => switchRole('teacher')}>
                        Показать экран преподавателя
                      </button>
                    </section>
                  ) : (
                    <SubmitForm
                      key={assignment.id}
                      assignmentId={assignment.id}
                      onDone={() =>
                        setNotice('Работа отправлена и появилась в очереди преподавателя.')
                      }
                    />
                  )}
                </div>
              </div>
            </>
          ) : role === 'student' ? (
            <>
              <div className="page-heading">
                <span className="eyebrow">Конструирование программного обеспечения</span>
                <h1>Мои задания</h1>
                <p>Отправляйте работы и следите за результатами проверки.</p>
              </div>
              <div className="filters" aria-label="Фильтр заданий">
                {(['all', 'empty', 'submitted', 'reviewed', 'rejected'] as const).map((status) => (
                  <button
                    key={status}
                    aria-pressed={filter === status}
                    className={filter === status ? 'filter active' : 'filter'}
                    onClick={() => setFilter(status)}
                  >
                    {status === 'all' ? 'Все' : labels[status]}
                    <span>
                      {status === 'all'
                        ? assignments.length
                        : assignments.filter(
                            (a) => (store.workForAssignment(a.id)?.status ?? 'empty') === status,
                          ).length}
                    </span>
                  </button>
                ))}
              </div>
              <div className="list-layout">
                <div className="assignment-list">
                  {assignments
                    .filter(
                      (a) =>
                        filter === 'all' ||
                        (store.workForAssignment(a.id)?.status ?? 'empty') === filter,
                    )
                    .map((a) => {
                      const current = store.workForAssignment(a.id);
                      return (
                        <button className="assignment-row" key={a.id} onClick={() => open(a.id)}>
                          <span className="assignment-number">{a.number}</span>
                          <div className="assignment-title">
                            <strong>{a.title}</strong>
                            <small>Срок сдачи: {a.due}</small>
                          </div>
                          <div className="assignment-state">
                            <Badge status={current?.status ?? 'empty'} />
                            {current?.grade !== null && current?.grade !== undefined && (
                              <span className="row-grade">{current.grade} / 100</span>
                            )}
                          </div>
                          <Arrow />
                        </button>
                      );
                    })}
                  {!assignments.some(
                    (a) =>
                      filter === 'all' ||
                      (store.workForAssignment(a.id)?.status ?? 'empty') === filter,
                  ) && (
                    <div className="empty-state compact">
                      <h2>Таких заданий пока нет</h2>
                      <p>Выберите другой статус или покажите все задания.</p>
                      <button className="button" onClick={() => setFilter('all')}>
                        Показать все
                      </button>
                    </div>
                  )}
                </div>
                <aside className="help-panel">
                  <span className="eyebrow">Порядок работы</span>
                  <ol>
                    <li>
                      <strong>Откройте задание</strong>
                      <span>Посмотрите условие и критерии.</span>
                    </li>
                    <li>
                      <strong>Отправьте работу</strong>
                      <span>Выберите файл и добавьте комментарий.</span>
                    </li>
                    <li>
                      <strong>Получите рецензию</strong>
                      <span>Оценка и рекомендации появятся в задании.</span>
                    </li>
                  </ol>
                  <div className="help-footer">
                    Для показа проверки смените роль в правом верхнем углу.
                  </div>
                </aside>
              </div>
            </>
          ) : (
            <>
              <div className="page-heading">
                <span className="eyebrow">Конструирование программного обеспечения</span>
                <h1>Работы на проверку</h1>
                <p>
                  {pending.length > 0
                    ? 'Откройте работу, выставьте оценку и оставьте рекомендации.'
                    : 'Все поступившие работы проверены.'}
                </p>
              </div>
              <div className="queue-summary">
                <span>{pending.length} в очереди</span>
                <span>Курс: Конструирование ПО</span>
              </div>
              {pending.length === 0 ? (
                <div className="empty-state">
                  <span className="empty-symbol">✓</span>
                  <h2>Очередь пуста</h2>
                  <p>Новые работы появятся после отправки студентом.</p>
                  <button className="button" onClick={() => switchRole('student')}>
                    Открыть экран студента
                  </button>
                </div>
              ) : (
                <div className="assignment-list">
                  {pending.map((item) => {
                    const a = assignments.find((a) => a.id === item.assignmentId)!;
                    return (
                      <button
                        className="assignment-row teacher-row"
                        key={item.id}
                        onClick={() => open(a.id)}
                      >
                        <span className="assignment-number">{a.number}</span>
                        <div className="assignment-title">
                          <strong>{a.title}</strong>
                          <small>Студент · ПИбд-42 · {date(item.submittedAt)}</small>
                        </div>
                        <Badge status="submitted" />
                        <span className="row-action">
                          Проверить <Arrow />
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          )}
          <footer className="page-footer">
            <span>Рецензия · учебный прототип</span>
            <span>React + TypeScript · работает без сети</span>
          </footer>
        </main>
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
