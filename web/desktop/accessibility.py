"""Expose the native controls to browser keyboard and accessibility APIs."""
from PySide6.QtCore import QPoint, Qt
from PySide6.QtTest import QTest
from PySide6.QtWidgets import (QApplication, QAbstractButton, QLineEdit,
    QWidget, QFormLayout, QSpinBox, QDoubleSpinBox, QComboBox, QTabBar, QMenu, QToolButton)
from bridge import bridge

controls = {}


def capture(window):
    root = QApplication.activePopupWidget() or QApplication.activeModalWidget() or window
    widgets = [root, *root.findChildren(QWidget)]
    rows, current = [], {}
    def field_name(widget, fallback):
        parent = widget.parentWidget()
        if parent and isinstance(parent.layout(), QFormLayout):
            label = parent.layout().labelForField(widget)
            if label and hasattr(label, 'text'):
                return label.text()
        return widget.accessibleName() or widget.objectName() or fallback
    def add(widget, name, kind, *, suffix='', rectangle=None, **extra):
        if not name or not widget.isVisible() or not widget.isEnabled():
            return
        visible = widget.visibleRegion().boundingRect()
        rectangle = visible if rectangle is None else rectangle.intersected(visible)
        if rectangle.isEmpty():
            return
        origin = widget.mapToGlobal(rectangle.topLeft())
        identifier = f'{id(widget)}{suffix}'
        current[identifier] = (widget, extra.get('index'))
        rows.append(dict(id=identifier, name=name.replace('&', ''), kind=kind,
            x=origin.x(), y=origin.y(), width=rectangle.width(), height=rectangle.height(), **extra))
    if isinstance(root, QMenu):
        for index, action in enumerate(root.actions()):
            if action.isSeparator() or not action.isEnabled():
                continue
            add(root, action.text(), 'button', suffix=f'-{index}', rectangle=root.actionGeometry(action), index=index)
    else:
        for widget in widgets:
            if not hasattr(widget, 'isVisible') or not widget.isVisible():
                continue
            if isinstance(widget, QAbstractButton):
                add(widget, widget.text() or widget.accessibleName() or widget.toolTip(), 'button', checked=widget.isChecked() if widget.isCheckable() else None)
            elif isinstance(widget, QTabBar):
                for index in range(widget.count()):
                    if widget.isTabEnabled(index):
                        add(widget, widget.tabText(index), 'tab', suffix=f'-{index}', rectangle=widget.tabRect(index), index=index, selected=widget.currentIndex()==index)
            elif isinstance(widget, (QSpinBox, QDoubleSpinBox)):
                add(widget, field_name(widget, 'Value'), 'number', value=widget.value(), minimum=widget.minimum(), maximum=widget.maximum(), step=widget.singleStep())
            elif isinstance(widget, QComboBox):
                add(widget, field_name(widget, 'Selection'), 'select', value=widget.currentIndex(), options=[widget.itemText(i) for i in range(widget.count())])
            elif isinstance(widget, QLineEdit) and not isinstance(widget.parentWidget(), (QSpinBox, QDoubleSpinBox, QComboBox)) and not widget.isReadOnly():
                add(widget, field_name(widget, widget.placeholderText() or 'Text'), 'text', value=widget.text())
    controls.clear()
    controls.update(current)
    with bridge.lock:
        bridge.controls = rows


def act(command):
    item = controls.get(command.get('id'))
    if not item:
        return
    widget, index = item
    if not widget.isVisible() or not widget.isEnabled():
        return
    action = command.get('operation', 'click')
    if action == 'focus':
        widget.setFocus()
    elif action == 'change':
        value = command.get('value')
        if isinstance(widget, QSpinBox):
            widget.setValue(int(value))
        elif isinstance(widget, QDoubleSpinBox):
            widget.setValue(float(value))
        elif isinstance(widget, QComboBox):
            widget.setCurrentIndex(max(0, min(widget.count()-1, int(value))))
        elif isinstance(widget, QLineEdit):
            widget.setText(str(value)[:10000])
            widget.editingFinished.emit()
    elif isinstance(widget, QTabBar):
        if widget.isTabEnabled(index):
            widget.setCurrentIndex(index)
    elif isinstance(widget, QMenu):
        widget.setActiveAction(widget.actions()[index])
        QTest.keyClick(widget, Qt.Key_Return)
    elif isinstance(widget, QAbstractButton):
        widget.setFocus()
        if isinstance(widget, QToolButton) and widget.menu():
            widget.showMenu()
        else:
            widget.click()
