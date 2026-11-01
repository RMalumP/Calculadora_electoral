/**
 * groupings.js
 * Gestión de agrupaciones de partidos: columna de número, cabeceras,
 * colapso/expansión, eliminación y lógica para el calculador.
 */

let groupingsVisible = false;
let groupingStates = {}; // { groupNum: { collapsed: bool } }

/* ── Visibilidad de la columna ── */

function toggleGroupingsVisibility() {
  groupingsVisible = !groupingsVisible;
  const btn = document.getElementById('groupings-toggle-btn');
  if (btn) {
    btn.style.background    = groupingsVisible ? 'var(--accent)' : 'none';
    btn.style.color         = groupingsVisible ? 'white' : 'var(--text-muted)';
    btn.style.borderColor   = groupingsVisible ? 'var(--accent)' : 'var(--border)';
    btn.textContent         = groupingsVisible ? 'Agrupación ▲' : 'Agrupación ▼';
  }
  document.getElementById('votes-table')?.classList.toggle('groupings-active', groupingsVisible);
}

/* ── Ciclo del número de agrupación (0–11) ── */

function cycleGroupNum(btn) {
  const current = parseInt(btn.textContent) || 0;
  const next    = (current + 1) % 12;
  btn.textContent = next;
  btn.classList.toggle('group-num-active', next > 0);
  const tr = btn.closest('tr');
  if (tr) {
    tr.dataset.groupNum = String(next);
    applyGroupings();
    updateTotals();
  }
}

/* ── Aplicar / reorganizar agrupaciones ── */

function applyGroupings() {
  const tbody = document.getElementById('votes-body');
  if (!tbody) return;

  const allRows  = [...tbody.children];
  const partyRows = allRows.filter(r =>
    !r.classList.contains('group-header-row') && !r.dataset.isOtros
  );

  // Construir mapa de grupos
  const groupsMap = {};
  partyRows.forEach(tr => {
    const num = parseInt(tr.dataset.groupNum || '0');
    if (num > 0) {
      if (!groupsMap[num]) groupsMap[num] = [];
      groupsMap[num].push(tr);
    }
  });

  // Grupos activos: 2 o más miembros
  const activeGroups = {};
  Object.entries(groupsMap).forEach(([num, rows]) => {
    if (rows.length >= 2) activeGroups[parseInt(num)] = rows;
  });

  // Eliminar cabeceras antiguas
  allRows.filter(r => r.classList.contains('group-header-row')).forEach(r => r.remove());

  // Actualizar estado visual de filas de partido
  partyRows.forEach(tr => {
    const num      = parseInt(tr.dataset.groupNum || '0');
    const inActive = num > 0 && activeGroups[num];
    tr.classList.toggle('in-group', !!inActive);
    _updateRowActionsForGroup(tr, inActive ? num : 0);
  });

  // Orden actual (sin cabeceras, sin Otros)
  const currentOrder = [...tbody.children].filter(r => !r.dataset.isOtros);

  // Insertar cabeceras y reordenar miembros
  const activeGroupNums = Object.keys(activeGroups).map(Number).sort((a, b) => a - b);
  activeGroupNums.forEach(groupNum => {
    const members = activeGroups[groupNum];

    // Ordenar miembros por votos desc
    members.sort((a, b) =>
      parseVoteValue(b.querySelector('.votes-input')?.value) -
      parseVoteValue(a.querySelector('.votes-input')?.value)
    );

    // Punto de inserción: primer miembro en el orden DOM actual
    let insertPoint = null;
    for (const row of currentOrder) {
      if (members.includes(row)) { insertPoint = row; break; }
    }

    if (insertPoint) {
      const headerRow = _buildGroupHeaderRow(groupNum, members);
      tbody.insertBefore(headerRow, insertPoint);

      // Colocar todos los miembros justo después del header
      let insertAfter = headerRow;
      members.forEach(member => {
        if (insertAfter.nextElementSibling !== member) {
          tbody.insertBefore(member, insertAfter.nextElementSibling);
        }
        insertAfter = member;
        member.classList.add('group-anim');
        member.addEventListener('animationend', () => member.classList.remove('group-anim'), { once: true });
      });
    }
  });

  // Aplicar estados de colapso
  activeGroupNums.forEach(groupNum => {
    if (groupingStates[groupNum]?.collapsed) _setGroupRowsVisibility(groupNum, false);
  });

  enforceOtrosLast();
}

/* ── Construir fila de cabecera de agrupación ── */

function _buildGroupHeaderRow(groupNum, members) {
  const totalVotes  = members.reduce((s, tr) =>
    s + parseVoteValue(tr.querySelector('.votes-input')?.value), 0);
  const isCollapsed = groupingStates[groupNum]?.collapsed || false;

  const tr = document.createElement('tr');
  tr.className    = 'group-header-row';
  tr.dataset.groupId = String(groupNum);

  tr.innerHTML = `
    <td colspan="7" class="group-header-cell">
      <div class="group-header-content">
        <button class="group-collapse-btn" title="${isCollapsed ? 'Expandir' : 'Colapsar'}">${isCollapsed ? '▶' : '▼'}</button>
        <span class="group-header-name">Agrupación ${groupNum}</span>
        <span class="group-header-votes">(${totalVotes.toLocaleString('es-ES')} votos)</span>
        <button class="del-btn group-del-btn" title="Eliminar agrupación">✕</button>
      </div>
    </td>`;

  tr.querySelector('.group-collapse-btn').addEventListener('click', () => toggleGroupCollapse(groupNum));
  tr.querySelector('.group-del-btn').addEventListener('click', () => deleteGroup(groupNum));

  return tr;
}

/* ── Colapsar / expandir ── */

function toggleGroupCollapse(groupNum) {
  if (!groupingStates[groupNum]) groupingStates[groupNum] = {};
  groupingStates[groupNum].collapsed = !groupingStates[groupNum].collapsed;

  const headerRow = document.querySelector(`.group-header-row[data-group-id="${groupNum}"]`);
  if (headerRow) {
    const btn         = headerRow.querySelector('.group-collapse-btn');
    const nowCollapsed = groupingStates[groupNum].collapsed;
    if (btn) { btn.textContent = nowCollapsed ? '▶' : '▼'; btn.title = nowCollapsed ? 'Expandir' : 'Colapsar'; }
  }
  _setGroupRowsVisibility(groupNum, !groupingStates[groupNum].collapsed);
}

function _setGroupRowsVisibility(groupNum, visible) {
  const tbody = document.getElementById('votes-body');
  if (!tbody) return;
  [...tbody.children].forEach(tr => {
    if (!tr.classList.contains('group-header-row') &&
        !tr.dataset.isOtros &&
        parseInt(tr.dataset.groupNum || '0') === groupNum) {
      tr.style.display = visible ? '' : 'none';
    }
  });
}

/* ── Eliminar agrupación ── */

function deleteGroup(groupNum) {
  const isCollapsed = groupingStates[groupNum]?.collapsed || false;
  const tbody       = document.getElementById('votes-body');
  if (!tbody) return;

  [...tbody.children].forEach(tr => {
    if (tr.classList.contains('group-header-row') && parseInt(tr.dataset.groupId) === groupNum) {
      tr.remove();
    } else if (!tr.classList.contains('group-header-row') &&
               parseInt(tr.dataset.groupNum || '0') === groupNum) {
      if (isCollapsed) {
        tr.remove();
      } else {
        tr.dataset.groupNum = '0';
        const btn = tr.querySelector('.group-num-btn');
        if (btn) { btn.textContent = '0'; btn.classList.remove('group-num-active'); }
        tr.classList.remove('in-group');
        tr.style.display = '';
        _updateRowActionsForGroup(tr, 0);
      }
    }
  });

  delete groupingStates[groupNum];
  enforceOtrosLast();
  updateTotals();
}

/* ── Sacar partido de la agrupación ── */

function removeFromGroup(tr) {
  if (tr.dataset.locked === 'true') return;
  const groupNum = parseInt(tr.dataset.groupNum || '0');
  if (groupNum === 0) return;

  tr.dataset.groupNum = '0';
  const btn = tr.querySelector('.group-num-btn');
  if (btn) { btn.textContent = '0'; btn.classList.remove('group-num-active'); }

  applyGroupings();
  updateTotals();
}

/* ── Actualizar botones de acción según estado de grupo ── */

function _updateRowActionsForGroup(tr, groupNum) {
  const toOtrosBtn = tr.querySelector('.btn-to-otros');
  if (!toOtrosBtn) return;
  if (groupNum > 0) {
    toOtrosBtn.textContent      = '←';
    toOtrosBtn.title            = 'Sacar de la agrupación';
    toOtrosBtn.dataset.inGroup  = 'true';
  } else {
    toOtrosBtn.textContent      = '→';
    toOtrosBtn.title            = 'Mover a Otros partidos';
    toOtrosBtn.dataset.inGroup  = 'false';
  }
}

/* ── Datos de grupos activos para el calculador ── */

function getActiveGroupsData() {
  const tbody = document.getElementById('votes-body');
  if (!tbody) return {};

  const groupsMap = {};
  [...tbody.children].forEach(tr => {
    if (tr.classList.contains('group-header-row') || tr.dataset.isOtros) return;
    const num = parseInt(tr.dataset.groupNum || '0');
    if (num > 0) {
      if (!groupsMap[num]) groupsMap[num] = [];
      groupsMap[num].push(tr);
    }
  });

  const active = {};
  Object.entries(groupsMap).forEach(([num, rows]) => {
    if (rows.length >= 2) active[parseInt(num)] = rows;
  });
  return active;
}
